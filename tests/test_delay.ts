import { after } from 'lodash';
import { describe, beforeEach, it, before, after as afterAll } from 'mocha';
import { expect } from 'chai';
import { default as IORedis } from 'ioredis';
import { v4 } from 'uuid';
import { Queue, Job, Worker, QueueEvents } from '../src/classes';
import { removeAllQueueData, delay } from '../src/utils';

describe('Delayed jobs', function () {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const prefix = process.env.BULLMQ_TEST_PREFIX || 'bull';
  this.timeout(15000);

  let queue: Queue;
  let queueName: string;

  let connection;
  before(async function () {
    connection = new IORedis(redisHost, { maxRetriesPerRequest: null });
  });

  beforeEach(async function () {
    queueName = `test-${v4()}`;
    queue = new Queue(queueName, { connection, prefix });
    await queue.waitUntilReady();
  });

  afterEach(async function () {
    await queue.close();
    await removeAllQueueData(new IORedis(redisHost), queueName);
  });

  afterAll(async function () {
    await connection.quit();
  });

  it('should process a delayed job only after delayed time', async function () {
    const delay = 1000;
    const margin = 1.2;

    const queueEvents = new QueueEvents(queueName, { connection, prefix });
    await queueEvents.waitUntilReady();

    const worker = new Worker(queueName, async () => {}, {
      connection,
      prefix,
    });
    await worker.waitUntilReady();

    const timestamp = Date.now();
    let publishHappened = false;

    const delayed = new Promise<void>(resolve => {
      queueEvents.on('delayed', () => {
        publishHappened = true;
        resolve();
      });
    });

    const completed = new Promise<void>((resolve, reject) => {
      worker.on('completed', async function (job) {
        try {
          expect(Date.now() > timestamp + delay);
          expect(job.processedOn! - job.timestamp).to.be.greaterThanOrEqual(
            delay,
          );
          expect(
            job.processedOn! - job.timestamp,
            'processedOn is not within margin',
          ).to.be.lessThan(delay * margin);

          const jobs = await queue.getWaiting();
          expect(jobs.length).to.be.equal(0);

          const delayedJobs = await queue.getDelayed();
          expect(delayedJobs.length).to.be.equal(0);
          expect(publishHappened).to.be.eql(true);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });

    const job = await queue.add('test', { delayed: 'foobar' }, { delay });

    expect(job.id).to.be.ok;
    expect(job.data.delayed).to.be.eql('foobar');
    expect(job.opts.delay).to.be.eql(delay);
    expect(job.delay).to.be.eql(delay);

    await delayed;
    await completed;
    await queueEvents.close();
    await worker.close();
  });

  describe('when markers are deleted', function () {
    it('should process a delayed job without getting stuck', async function () {
      const delayTime = 6000;
      const margin = 1.2;

      const queueEvents = new QueueEvents(queueName, { connection, prefix });
      await queueEvents.waitUntilReady();

      const worker = new Worker(queueName, async () => {}, {
        connection,
        autorun: false,
        prefix,
      });
      await worker.waitUntilReady();

      const timestamp = Date.now();
      let publishHappened = false;

      const delayed = new Promise<void>(resolve => {
        queueEvents.on('delayed', () => {
          publishHappened = true;
          resolve();
        });
      });

      const completed = new Promise<void>((resolve, reject) => {
        worker.on('completed', async function (job) {
          try {
            expect(Date.now() > timestamp + delayTime);
            expect(job.processedOn! - job.timestamp).to.be.greaterThanOrEqual(
              delayTime,
            );
            expect(
              job.processedOn! - job.timestamp,
              'processedOn is not within margin',
            ).to.be.lessThan(delayTime * margin);

            const jobs = await queue.getWaiting();
            expect(jobs.length).to.be.equal(0);

            const delayedJobs = await queue.getDelayed();
            expect(delayedJobs.length).to.be.equal(0);
            expect(publishHappened).to.be.eql(true);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });

      const job = await queue.add(
        'test',
        { delayed: 'foobar' },
        { delay: delayTime },
      );

      expect(job.id).to.be.ok;
      expect(job.data.delayed).to.be.eql('foobar');
      expect(job.opts.delay).to.be.eql(delayTime);
      expect(job.delay).to.be.eql(delayTime);

      await delayed;

      const client = await queue.client;
      await client.del(queue.toKey('marker'));

      worker.run();

      await delay(2000);

      await client.del(queue.toKey('marker'));

      await completed;
      await queueEvents.close();
      await worker.close();
    });
  });

  describe('when delay is provided as 0', function () {
    describe('when priority is not provided', function () {
      it('should add job directly into wait state', async function () {
        const job = await queue.add('test', {}, { delay: 0 });

        const state = await job.getState();
        expect(state).to.be.eql('waiting');
      });
    });

    describe('when priority is provided', function () {
      it('should add job directly into prioritized state', async function () {
        const job = await queue.add('test', {}, { delay: 0, priority: 1 });

        const state = await job.getState();
        expect(state).to.be.eql('prioritized');
      });
    });
  });

  describe('when queue is paused', function () {
    it('should keep moving delayed jobs to waiting', async function () {
      const delayTime = 2500;
      const margin = 1.2;

      const queueEvents = new QueueEvents(queueName, { connection, prefix });
      await queueEvents.waitUntilReady();

      await queue.pause();
      const worker = new Worker(queueName, async () => {}, {
        connection,
        prefix,
      });
      await worker.waitUntilReady();

      const timestamp = Date.now();

      const waiting = new Promise<void>(resolve => {
        queueEvents.on('waiting', () => {
          const currentDelay = Date.now() - timestamp;
          expect(currentDelay).to.be.greaterThanOrEqual(delayTime);
          expect(currentDelay).to.be.lessThanOrEqual(delayTime * margin);
          resolve();
        });
      });

      await queue.add('test', { delayed: 'foobar' }, { delay: delayTime });

      await waiting;

      await queueEvents.close();
      await worker.close();
    });
  });

  it('should process a delayed job added after an initial long delayed job', async function () {
    const oneYearDelay = 1000 * 60 * 60 * 24 * 365; // One year.
    const delayTime = 1000;
    const margin = 1.2;

    const queueEvents = new QueueEvents(queueName, { connection, prefix });
    await queueEvents.waitUntilReady();

    const worker = new Worker(queueName, async () => {}, {
      connection,
      prefix,
    });
    await worker.waitUntilReady();

    const timestamp = Date.now();
    let publishHappened = false;

    const delayed = new Promise<void>(resolve => {
      queueEvents.on('delayed', () => {
        publishHappened = true;
        resolve();
      });
    });

    const completed = new Promise<void>((resolve, reject) => {
      worker.on('completed', async function (job) {
        try {
          expect(Date.now() > timestamp + delayTime);
          expect(job.processedOn! - job.timestamp).to.be.greaterThanOrEqual(
            delayTime,
          );
          expect(
            job.processedOn! - job.timestamp,
            'processedOn is not within margin',
          ).to.be.lessThan(delayTime * margin);

          const jobs = await queue.getWaiting();
          expect(jobs.length).to.be.equal(0);

          const delayedJobs = await queue.getDelayed();
          expect(delayedJobs.length).to.be.equal(1);
          expect(publishHappened).to.be.eql(true);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });

    await queue.add('test', { delayed: 'foobar' }, { delay: oneYearDelay });

    await delay(1000);

    const job = await queue.add(
      'test',
      { delayed: 'foobar' },
      { delay: delayTime },
    );

    expect(job.id).to.be.ok;
    expect(job.data.delayed).to.be.eql('foobar');
    expect(job.opts.delay).to.be.eql(delayTime);
    expect(job.delay).to.be.eql(delayTime);

    await delayed;
    await completed;

    const count = await queue.getJobCountByTypes('active');
    expect(count).to.be.equal(0);

    await queueEvents.close();
    await worker.close();
  });

  it('should process delayed jobs in correct order respecting delay', async function () {
    this.timeout(7500);
    let order = 0;
    const numJobs = 12;
    const margin = 1.2;

    let processor;

    const processing = new Promise<void>((resolve, reject) => {
      processor = async (job: Job) => {
        order++;
        try {
          expect(order).to.be.equal(job.data.order);
          expect(job.processedOn! - job.timestamp).to.be.greaterThanOrEqual(
            job.opts.delay,
          );
          expect(
            job.processedOn! - job.timestamp,
            'processedOn is not within margin',
          ).to.be.lessThan(job.opts.delay * margin);

          if (order === numJobs) {
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      };
    });

    const worker = new Worker(queueName, processor, {
      autorun: false,
      connection,
      prefix,
    });

    worker.on('failed', function (job, err) {});

    const jobs = Array.from(Array(numJobs).keys()).map(index => ({
      name: 'test',
      data: { order: numJobs - index },
      opts: {
        delay: 500 + (numJobs - index) * 150,
      },
    }));

    await queue.addBulk(jobs);
    worker.run();
    await processing;
    await worker.close();
  });

  it('should process delayed jobs with several workers respecting delay', async function () {
    this.timeout(30000);
    let count = 0;
    const numJobs = 50;
    const margin = 1.3;

    let processor1, processor2;

    const createProcessor =
      (
        name: string,
        resolve: (value: void | PromiseLike<void>) => void,
        reject: (value: void | PromiseLike<void>) => void,
      ) =>
      async (job: Job) => {
        count++;
        try {
          const delayed = job.processedOn! - job.timestamp;
          expect(
            delayed,
            'waited at least delay time',
          ).to.be.greaterThanOrEqual(job.opts.delay);
          expect(delayed, 'processedOn is not within margin').to.be.lessThan(
            job.opts.delay * margin,
          );

          if (count === numJobs) {
            resolve();
          }
        } catch (err) {
          reject(err);
        }

        await delay(100);
      };

    const processing = new Promise<void>((resolve, reject) => {
      processor1 = createProcessor('worker 1', resolve, reject);
      processor2 = createProcessor('worker 2', resolve, reject);
    });

    const worker = new Worker(queueName, processor1, {
      connection,
      prefix,
      concurrency: numJobs / 2,
    });

    const worker2 = new Worker(queueName, processor2, {
      connection,
      prefix,
      concurrency: numJobs / 2,
    });

    await worker.waitUntilReady();
    await worker2.waitUntilReady();

    const jobs = Array.from(Array(numJobs).keys()).map(index => ({
      name: 'test',
      data: { order: numJobs - index },
      opts: {
        delay: 500 + (numJobs - index),
      },
    }));

    await queue.addBulk(jobs);
    await processing;
    await worker.close();
    await worker2.close();
  });

  // Add test where delays overlap so that we can see that indeed the jobs are processed concurrently.
  it('should process delayed jobs concurrently respecting delay and concurrency', async function () {
    const delay_ = 250;
    const concurrency = 100;
    const margin = 2;
    let numJobs = 10;
    let jobsToProcess = numJobs;

    let worker;
    const processing = new Promise<void>((resolve, reject) => {
      worker = new Worker(
        queueName,
        async job => {
          const delayed = Date.now() - job.timestamp;
          try {
            expect(
              delayed,
              'waited at least delay time',
            ).to.be.greaterThanOrEqual(delay_);
            expect(
              delayed,
              'waited less than delay time and margin',
            ).to.be.lessThan(delay_ * margin);
          } catch (err) {
            console.error(err);
            reject(err);
          }
          jobsToProcess -= 1;
          if (!jobsToProcess) {
            resolve();
          }
        },
        { connection, prefix, concurrency },
      );
    });

    let index = 1;
    while (numJobs) {
      await queue.add('my-queue', { foo: 'bar', index }, { delay: delay_ });
      index += 1;
      numJobs -= 1;
      await delay(50); // Add a small delay to ensure jobs are staggered.
    }
    await processing;
    await worker.close();
  });

  describe('when failed jobs are retried and moved to delayed', function () {
    it('processes jobs without getting stuck', async () => {
      const countJobs = 2;
      const concurrency = 50;

      const processedJobs: { data: any }[] = [];
      const worker = new Worker(
        queueName,
        async (job: Job) => {
          if (job.attemptsMade == 0) {
            await delay(250);
            throw new Error('forced error in test');
          }

          await delay(25);

          processedJobs.push({ data: job.data });

          return;
        },
        {
          autorun: false,
          connection,
          prefix,
          concurrency,
        },
      );
      worker.on('error', err => {
        console.error(err);
      });

      const completed = new Promise<void>(resolve => {
        worker.on(
          'completed',
          after(countJobs, async () => {
            resolve();
          }),
        );
      });

      worker.run();

      for (let j = 0; j < countJobs; j++) {
        await queue.add(
          'test',
          { foo: `bar${j}` },
          { attempts: 2, backoff: 10 },
        );
      }

      await completed;

      expect(processedJobs.length).to.be.equal(countJobs);

      const count = await queue.getJobCountByTypes('failed', 'wait', 'delayed');
      expect(count).to.be.equal(0);

      await worker.close();
    }).timeout(4000);
  });

  it('should process delayed jobs with exact same timestamps in correct order (FIFO)', async function () {
    let order = 1;
    const numJobs = 43;

    let worker: Worker;
    const processing = new Promise<void>((resolve, reject) => {
      worker = new Worker(
        queueName,
        async (job: Job) => {
          try {
            expect(order).to.be.equal(job.data.order);

            if (order === numJobs) {
              resolve();
            }
          } catch (err) {
            reject(err);
          }

          order++;
        },
        { connection, prefix },
      );

      worker.on('failed', function (job, err) {
        reject();
      });
    });

    const now = Date.now();
    let i = 1;
    for (i; i <= numJobs; i++) {
      await queue.add(
        'test',
        { order: i },
        {
          delay: 1000,
          timestamp: now,
        },
      );
    }
    await processing;
    await worker!.close();
  });

  describe('when autorun option is provided as false', function () {
    it('should process a delayed job only after delayed time', async function () {
      const delay = 1000;
      const queueEvents = new QueueEvents(queueName, { connection, prefix });
      await queueEvents.waitUntilReady();

      const worker = new Worker(queueName, async () => {}, {
        connection,
        prefix,
        autorun: false,
      });
      await worker.waitUntilReady();

      const timestamp = Date.now();
      let publishHappened = false;

      const delayed = new Promise<void>(resolve => {
        queueEvents.on('delayed', () => {
          publishHappened = true;
          resolve();
        });
      });

      const completed = new Promise<void>((resolve, reject) => {
        queueEvents.on('completed', async function () {
          try {
            expect(Date.now() > timestamp + delay);
            const jobs = await queue.getWaiting();
            expect(jobs.length).to.be.equal(0);

            const delayedJobs = await queue.getDelayed();
            expect(delayedJobs.length).to.be.equal(0);
            expect(publishHappened).to.be.eql(true);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });

      const job = await queue.add('test', { delayed: 'foobar' }, { delay });

      expect(job.id).to.be.ok;
      expect(job.data.delayed).to.be.eql('foobar');
      expect(job.opts.delay).to.be.eql(delay);

      worker.run();

      await delayed;
      await completed;
      await queueEvents.close();
      await worker.close();
    });
  });
});
