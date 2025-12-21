const blockchain = require('./blockchain');

class SmartContractService {

    constructor() {
        console.log("Smart Contract Service Initialized connected to Local Simulation Chain");
    }

    async registerLand(landId, location, area, price, ownerId, documentCid, photoCid) {
        console.log(`\n--- [Smart Contract] Executing registerLand() ---`);
        console.log(`Sender: ${ownerId}`);
        console.log(`Parameters: LandID=${landId}, Location=${location}, Price=${price}`);
        console.log(`IPFS Assets: Doc=${documentCid}, Photo=${photoCid}`);

        // Simulate Gas Cost
        console.log(`Gas Used: 124050`);

        try {
            // In a real contract, we would store the IPFS hash, not the full URL.
            // Our blockchain.js addBlock method takes generic data.
            const txHash = await blockchain.registerLandOnChain(
                landId,
                location,
                area,
                price,
                ownerId
            );

            console.log(`[Event] LandRegistered: ${txHash}`);
            console.log(`--- [Smart Contract] Execution Successful ---\n`);
            return txHash;

        } catch (error) {
            console.error(`--- [Smart Contract] Reverted: ${error.message} ---`);
            throw error;
        }
    }

    async transferOwnership(landId, currentOwnerId, newOwnerId, price, location) {
        console.log(`\n--- [Smart Contract] Executing transferOwnership() ---`);
        console.log(`From: ${currentOwnerId}`);
        console.log(`To: ${newOwnerId}`);
        console.log(`Value: ${price} ETH (Simulated)`);

        console.log(`Gas Used: 84000`);

        try {
            const result = await blockchain.transferLandOnChain(
                landId,
                currentOwnerId,
                newOwnerId,
                price,
                location
            );

            console.log(`[Event] OwnershipTransferred: ${result.txHash}`);
            console.log(`--- [Smart Contract] Execution Successful ---\n`);
            return result;
        } catch (error) {
            console.error(`--- [Smart Contract] Reverted: ${error.message} ---`);
            throw error;
        }
    }

    async getHistory(userId) {
        // Just a wrapper to get data, smart contracts usually define View functions
        return await blockchain.getUserEvents([], userId);
    }
}

module.exports = new SmartContractService();
