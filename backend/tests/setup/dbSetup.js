const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let usingExternalMongo = false;

beforeAll(async () => {
    const externalUri = String(process.env.TEST_MONGODB_URI || '').trim();
    if (externalUri) {
        usingExternalMongo = true;
        await mongoose.connect(externalUri);
        return;
    }

    mongoServer = await MongoMemoryServer.create({
        instance: {
            ip: '127.0.0.1',
            port: 27027,
            dbName: 'medicare_test'
        }
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterEach(async () => {
    if (mongoose.connection.readyState !== 1) return;
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
    }
    if (!usingExternalMongo && mongoServer) {
        await mongoServer.stop();
    }
});
