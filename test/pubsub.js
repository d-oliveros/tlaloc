import { expect } from 'chai';
import { createRedisPubSub } from '../src/pubsub';

const redisConfig = {
  port: '6379',
  host: '127.0.0.1'
};

describe('PubSub', () => {

  it('should create a redis client', async () => {
    const pubsub1 = await createRedisPubSub({ ...redisConfig, id: 'id1' });
    expect(pubsub1.publish).to.be.a('function');
    expect(pubsub1.id).to.equal('id1');

    const pubsub2 = await createRedisPubSub({ ...redisConfig });
    expect(pubsub2.id).to.be.a('string');
    expect(pubsub2.id).to.not.equal(pubsub1.id);

    pubsub1.removeAllMessageListeners();
    pubsub2.removeAllMessageListeners();
  });

  it('should connect to redis and send a message to other pubsub client', async (done) => {
    const pubsub1 = await createRedisPubSub({ ...redisConfig });
    const pubsub2 = await createRedisPubSub({ ...redisConfig });

    pubsub1.onMessage('TEST_SIGNAL', (data) => {
      expect(data).to.be.an('object');
      pubsub1.removeAllMessageListeners();
      pubsub2.removeAllMessageListeners();
      done();
    });

    pubsub2.sendMessage('TEST_SIGNAL', pubsub1.id);
  });
});
