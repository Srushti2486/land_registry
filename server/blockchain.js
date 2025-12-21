const crypto = require('crypto');
const pool = require('./db');

class Block {
    constructor(index, timestamp, data, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.data = data;
        this.previousHash = previousHash;
        this.hash = this.calculateHash();
    }

    calculateHash() {
        return crypto.createHash('sha256').update(
            this.index + this.previousHash + this.timestamp + JSON.stringify(this.data)
        ).digest('hex');
    }
}

class Blockchain {
    constructor() {
        this.chain = [];
    }

    async initialize() {
        const [rows] = await pool.query('SELECT * FROM blocks ORDER BY idx ASC');
        if (rows.length === 0) {
            const genesisBlock = this.createGenesisBlock();
            this.chain.push(genesisBlock);
            await this.saveBlock(genesisBlock);
        } else {
            this.chain = rows.map(row => new Block(row.idx, row.timestamp, row.data, row.previousHash));
        }
    }

    async saveBlock(block) {
        await pool.query(
            'INSERT INTO blocks (idx, timestamp, data, previousHash, hash) VALUES (?, ?, ?, ?, ?)',
            [block.index, block.timestamp, JSON.stringify(block.data), block.previousHash, block.hash]
        );
    }

    createGenesisBlock() {
        return new Block(0, Date.now(), "Genesis Block", "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    async addBlock(data) {
        const previousBlock = this.getLatestBlock();
        const newBlock = new Block(
            previousBlock.index + 1,
            Date.now(),
            data,
            previousBlock.hash
        );
        this.chain.push(newBlock);
        await this.saveBlock(newBlock);
        return newBlock;
    }

    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (currentBlock.hash !== currentBlock.calculateHash()) {
                return false;
            }

            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }
        }
        return true;
    }

    // --- Simulation Methods to match ethereum.js interface ---

    async registerLandOnChain(landId, location, area, price, ownerId) {
        const data = {
            type: 'Registration',
            landId: landId,
            location: location,
            area: area,
            price: price,
            ownerId: ownerId,
            timestamp: Date.now()
        };
        const block = await this.addBlock(data);
        console.log(`[Simulation] Land registered on chain: Block #${block.index} Hash: ${block.hash}`);
        return block.hash;
    }

    async transferLandOnChain(landId, fromId, toId, price, location) {
        const data = {
            type: 'Transfer',
            landId: landId,
            from: fromId,
            to: toId,
            price: price,
            location: location,
            timestamp: Date.now()
        };
        const block = await this.addBlock(data);
        console.log(`[Simulation] Land transferred on chain: Block #${block.index} Hash: ${block.hash}`);
        return { txHash: block.hash, newOwner: toId };
    }

    async getBlockchainData() {
        // Return the chain data formatted for the frontend
        // The frontend expects: { number, hash, timestamp, transactions: [...] }
        // Our 'data' is the transaction.
        return this.chain.map(block => ({
            number: block.index,
            hash: block.hash,
            timestamp: new Date(block.timestamp).toLocaleString(),
            transactions: block.index === 0 ? [] : [{
                hash: block.hash, // Use block hash as tx hash for simplicity
                from: 'System',
                to: 'System',
                value: '0',
                timestamp: new Date(block.timestamp).toLocaleString(),
                details: block.data
            }]
        })).reverse(); // Show newest first
    }

    async getUserEvents(landIds, userId) {
        // Filter blocks where data.landId is in landIds
        const events = [];
        for (const block of this.chain) {
            if (block.index === 0) continue; // Skip genesis

            const data = block.data;
            if (data && landIds.includes(data.landId)) {
                // Strict filtering for "related to user only"
                if (userId) {
                    const isRegistration = data.type === 'Registration' && data.ownerId === userId;
                    const isTransfer = data.type === 'Transfer' && (data.from === userId || data.to === userId);
                    if (!isRegistration && !isTransfer) continue;
                }

                events.push({
                    type: data.type,
                    landIdHash: data.landId, // Use actual ID
                    blockNumber: block.index,
                    transactionHash: block.hash,
                    timestamp: new Date(block.timestamp).toLocaleString(),
                    details: data.type === 'Registration' ? {
                        location: data.location,
                        area: data.area,
                        price: data.price,
                        ownerId: data.ownerId
                    } : {
                        oldOwner: data.from || 'Unknown',
                        newOwner: data.to || data.newOwner, // Handle old format
                        price: data.price || '0',
                        location: data.location || 'Unknown'
                    }
                });
            }
        }
        return events.sort((a, b) => b.blockNumber - a.blockNumber);
    }

    verifyLandIntegrity(landId, currentDbRecord) {
        // 1. Reconstruct state from chain
        let expectedState = null;

        for (const block of this.chain) {
            const data = block.data;
            if (!data) continue;

            if (data.type === 'Registration' && data.landId === landId) {
                expectedState = {
                    ownerId: data.ownerId,
                    price: data.price
                };
            } else if (data.type === 'Transfer' && data.landId === landId) {
                if (expectedState) {
                    expectedState.ownerId = data.to;
                    expectedState.price = data.price;
                }
            }
        }

        if (!expectedState) return null; // Land not on chain (or genesis only)

        const discrepancies = [];

        // Compare Owner
        if (currentDbRecord.ownerId !== expectedState.ownerId) {
            discrepancies.push({
                field: 'ownerId',
                dbValue: currentDbRecord.ownerId,
                chainValue: expectedState.ownerId
            });
        }

        // Compare Price
        if (Number(currentDbRecord.price) !== Number(expectedState.price)) {
            discrepancies.push({
                field: 'price',
                dbValue: Number(currentDbRecord.price),
                chainValue: Number(expectedState.price)
            });
        }

        if (discrepancies.length > 0) {
            return {
                landId,
                isTampered: true,
                discrepancies
            };
        }

        return { landId, isTampered: false };
    }


    getLandsOwnedBy(userId) {
        const ownership = {}; // landId -> ownerId

        for (const block of this.chain) {
            const data = block.data;
            if (!data) continue;

            if (data.type === 'Registration') {
                ownership[data.landId] = data.ownerId;
            } else if (data.type === 'Transfer') {
                ownership[data.landId] = data.to;
            }
        }

        // Return land IDs where userId is the current owner
        return Object.keys(ownership).filter(landId => ownership[landId] === userId);
    }

    getLandStateFromChain(landId) {
        let expectedState = null;

        for (const block of this.chain) {
            const data = block.data;
            if (!data) continue;

            if (data.type === 'Registration' && data.landId === landId) {
                expectedState = {
                    ownerId: data.ownerId,
                    price: data.price
                };
            } else if (data.type === 'Transfer' && data.landId === landId) {
                if (expectedState) {
                    expectedState.ownerId = data.to;
                    expectedState.price = data.price;
                }
            }
        }
        return expectedState;
    }
}

const blockchain = new Blockchain();

module.exports = blockchain;
