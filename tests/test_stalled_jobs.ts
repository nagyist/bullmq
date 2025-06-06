import { FlowProducer, Queue, Worker, QueueEvents } from '../src/classes';
import { delay, removeAllQueueData } from '../src/utils';
import { default as IORedis } from 'ioredis';
import { after } from 'lodash';
import { beforeEach, describe, it, before, after as afterAll } from 'mocha';
import { v4 } from 'uuid';
import { expect } from 'chai';

const NoopProc = () => Promise.resolve();

describe('stalled jobs', function () {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const prefix = process.env.BULLMQ_TEST_PREFIX || 'bull';
  let queue: Queue;
  let queueName: string;

  let connection;
  before(async function () {
    connection = new IORedis(redisHost, { maxRetriesPerRequest: null });
  });

  beforeEach(async function () {
    queueName = `test-${v4()}`;
    queue = new Queue(queueName, { connection, prefix });
  });

  afterEach(async function () {
    await queue.close();
    await removeAllQueueData(new IORedis(redisHost), queueName);
  });

  afterAll(async function () {
    await connection.quit();
  });

  it('process stalled jobs when starting a queue', async function () {
    this.timeout(5000);

    const queueEvents = new QueueEvents(queueName, { connection, prefix });
    await queueEvents.waitUntilReady();

    const concurrency = 4;

    const worker = new Worker(
      queueName,
      async () => {
        return delay(10000);
      },
      {
        connection,
        prefix,
        lockDuration: 1000,
        stalledInterval: 100,
        concurrency,
      },
    );

    const allActive = new Promise(resolve => {
      worker.on('active', after(concurrency, resolve));
    });

    await worker.waitUntilReady();

    await Promise.all([
      queue.add('test', { bar: 'baz' }),
      queue.add('test', { bar1: 'baz1' }),
      queue.add('test', { bar2: 'baz2' }),
      queue.add('test', { bar3: 'baz3' }),
    ]);

    await allActive;
    await worker.close(true);

    const worker2 = new Worker(queueName, NoopProc, {
      connection,
      prefix,
      stalledInterval: 100,
      concurrency,
    });

    const allStalledGlobalEvent = new Promise(resolve => {
      queueEvents.on('stalled', after(concurrency, resolve));
    });

    const allStalled = new Promise<void>(resolve => {
      worker2.on(
        'stalled',
        after(concurrency, (jobId, prev) => {
          expect(prev).to.be.equal('active');
          resolve();
        }),
      );
    });

    await allStalled;
    await allStalledGlobalEvent;

    const allCompleted = new Promise<void>(resolve => {
      worker2.on(
        'completed',
        after(concurrency, job => {
          expect(job.stalledCounter).to.be.equal(1);
          resolve();
        }),
      );
    });

    await allCompleted;

    await queueEvents.close();
    await worker2.close();
  });

  it("don't process stalled jobs when starting a queue with skipStalledCheck", async function () {
    const concurrency = 4;

    const worker = new Worker(
      queueName,
      async () => {
        return delay(1000);
      },
      {
        connection,
        prefix,
        stalledInterval: 50,
        skipStalledCheck: true,
        concurrency,
      },
    );

    const allCompleted = new Promise(resolve => {
      worker.on('completed', after(concurrency, resolve));
    });

    await Promise.all([
      queue.add('test', { bar: 'baz' }),
      queue.add('test', { bar1: 'baz1' }),
      queue.add('test', { bar2: 'baz2' }),
      queue.add('test', { bar3: 'baz3' }),
    ]);

    await allCompleted;
    await worker.close();
  });

  it('fail stalled jobs that stall more than allowable stalled limit', async function () {
    this.timeout(6000);

    const queueEvents = new QueueEvents(queueName, { connection, prefix });
    await queueEvents.waitUntilReady();

    const concurrency = 4;

    const worker = new Worker(
      queueName,
      async () => {
        return delay(10000);
      },
      {
        connection,
        prefix,
        lockDuration: 1000,
        stalledInterval: 100,
        maxStalledCount: 0,
        concurrency,
      },
    );

    const allActive = new Promise(resolve => {
      worker.on('active', after(concurrency, resolve));
    });

    await worker.waitUntilReady();

    await Promise.all([
      queue.add('test', { bar: 'baz' }),
      queue.add('test', { bar1: 'baz1' }),
      queue.add('test', { bar2: 'baz2' }),
      queue.add('test', { bar3: 'baz3' }),
    ]);

    await allActive;

    await worker.close(true);

    const worker2 = new Worker(queueName, NoopProc, {
      connection,
      prefix,
      stalledInterval: 100,
      maxStalledCount: 0,
      concurrency,
    });

    const errorMessage = 'job stalled more than allowable limit';
    const allFailed = new Promise<void>(resolve => {
      worker2.on(
        'failed',
        after(concurrency, async (job, failedReason, prev) => {
          expect(job.finishedOn).to.be.an('number');
          expect(prev).to.be.equal('active');
          expect(failedReason.message).to.be.equal(errorMessage);
          resolve();
        }),
      );
    });

    const globalAllFailed = new Promise<void>(resolve => {
      queueEvents.on('failed', ({ failedReason }) => {
        expect(failedReason).to.be.equal(errorMessage);
        resolve();
      });
    });

    await allFailed;
    await globalAllFailed;

    await queueEvents.close();
    await worker2.close();
  });

  describe('when stalled jobs stall more than allowable stalled limit', function () {
    it('moves jobs to failed', async function () {
      this.timeout(6000);

      const queueEvents = new QueueEvents(queueName, { connection, prefix });
      await queueEvents.waitUntilReady();

      const concurrency = 4;

      const worker = new Worker(
        queueName,
        async () => {
          return delay(10000);
        },
        {
          connection,
          prefix,
          lockDuration: 1000,
          stalledInterval: 100,
          maxStalledCount: 0,
          concurrency,
        },
      );

      const allActive = new Promise(resolve => {
        worker.on('active', after(concurrency, resolve));
      });

      await worker.waitUntilReady();

      const jobs = await Promise.all([
        queue.add('test', { bar: 'baz' }, { removeOnFail: true }),
        queue.add('test', { bar1: 'baz1' }, { removeOnFail: true }),
        queue.add('test', { bar2: 'baz2' }, { removeOnFail: true }),
        queue.add('test', { bar3: 'baz3' }, { removeOnFail: true }),
      ]);

      await allActive;

      await worker.close(true);

      const worker2 = new Worker(queueName, NoopProc, {
        connection,
        prefix,
        stalledInterval: 100,
        maxStalledCount: 0,
        concurrency,
      });

      const errorMessage = 'job stalled more than allowable limit';
      const allFailed = new Promise<void>(resolve => {
        worker2.on(
          'failed',
          after(concurrency, async (job, failedReason, prev) => {
            expect(job?.attemptsStarted).to.be.equal(2);
            expect(job?.attemptsMade).to.be.equal(1);
            expect(job?.stalledCounter).to.be.equal(1);
            expect(prev).to.be.equal('active');
            expect(failedReason.message).to.be.equal(errorMessage);
            resolve();
          }),
        );
      });

      const globalAllFailed = new Promise<void>(resolve => {
        queueEvents.on('failed', ({ failedReason }) => {
          expect(failedReason).to.be.equal(errorMessage);
          resolve();
        });
      });

      await allFailed;
      await globalAllFailed;

      const redisClient = await queue.client;
      const keys = await redisClient.keys(`${prefix}:${queueName}:*`);

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const key = keys.find(key => key.endsWith(job.id!));
        if (key) {
          throw new Error('Job should have been removed from redis');
        }
      }

      await queueEvents.close();
      await worker2.close();
    });

    it('moves jobs to failed with maxStalledCount > 1', async function () {
      this.timeout(8000);

      const queueEvents = new QueueEvents(queueName, { connection, prefix });
      await queueEvents.waitUntilReady();

      const concurrency = 4;
      const maxStalledCount = 2;

      const jobs = await Promise.all([
        queue.add('test', { bar: 'baz' }, { removeOnFail: true }),
        queue.add('test', { bar1: 'baz1' }, { removeOnFail: true }),
        queue.add('test', { bar2: 'baz2' }, { removeOnFail: true }),
        queue.add('test', { bar3: 'baz3' }, { removeOnFail: true }),
      ]);

      for (let i = 0; i <= maxStalledCount + 1; i++) {
        const worker = new Worker(
          queueName,
          async () => {
            return delay(10000);
          },
          {
            connection,
            prefix,
            lockDuration: 1000,
            stalledInterval: 100,
            maxStalledCount,
            concurrency,
          },
        );

        if (i <= maxStalledCount) {
          const allActive = new Promise(resolve => {
            worker.on('active', after(concurrency, resolve));
          });

          await worker.waitUntilReady();
          await allActive;
        } else {
          const errorMessage = 'job stalled more than allowable limit';
          const allFailed = new Promise<void>(resolve => {
            worker.on(
              'failed',
              after(concurrency, async (job, failedReason, prev) => {
                expect(job?.attemptsStarted).to.be.equal(4);
                expect(job?.attemptsMade).to.be.equal(1);
                expect(job?.stalledCounter).to.be.equal(3);
                expect(prev).to.be.equal('active');
                expect(failedReason.message).to.be.equal(errorMessage);
                resolve();
              }),
            );
          });

          const globalAllFailed = new Promise<void>(resolve => {
            queueEvents.on('failed', ({ failedReason }) => {
              expect(failedReason).to.be.equal(errorMessage);
              resolve();
            });
          });

          await allFailed;
          await globalAllFailed;

          const redisClient = await queue.client;
          const keys = await redisClient.keys(`${prefix}:${queueName}:*`);

          for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            const key = keys.find(key => key.endsWith(job.id!));
            if (key) {
              throw new Error('Job should have been removed from redis');
            }
          }
        }

        await worker.close(true);
      }

      await queueEvents.close();
    });

    describe('when failParentOnFailure is provided as true', function () {
      it('should move parent to failed when child is moved to failed', async function () {
        this.timeout(6000);
        const concurrency = 4;
        const parentQueueName = `parent-queue-${v4()}`;

        const parentQueue = new Queue(parentQueueName, {
          connection,
          prefix,
        });

        const flow = new FlowProducer({ connection, prefix });

        const worker = new Worker(
          queueName,
          async () => {
            return delay(10000);
          },
          {
            connection,
            prefix,
            lockDuration: 1000,
            stalledInterval: 100,
            maxStalledCount: 0,
            concurrency,
          },
        );
        const parentWorker = new Worker(parentQueueName, async () => {}, {
          connection,
          prefix,
        });

        const allActive = new Promise(resolve => {
          worker.on('active', after(concurrency, resolve));
        });

        await worker.waitUntilReady();
        await parentWorker.waitUntilReady();

        const { children } = await flow.add({
          name: 'parent-job',
          queueName: parentQueueName,
          data: {},
          children: [
            {
              name: 'test',
              data: { foo: 'bar' },
              queueName,
              opts: { failParentOnFailure: true },
            },
          ],
        });

        const jobs = Array.from(Array(3).keys()).map(index => ({
          name: 'test',
          data: { index },
        }));

        await queue.addBulk(jobs);
        await allActive;
        await worker.close(true);

        const worker2 = new Worker(queueName, NoopProc, {
          connection,
          prefix,
          stalledInterval: 100,
          maxStalledCount: 0,
          concurrency,
        });

        const errorMessage = 'job stalled more than allowable limit';
        const allFailed = new Promise<void>(resolve => {
          worker2.on(
            'failed',
            after(concurrency, async (job, failedReason, prev) => {
              expect(prev).to.be.equal('active');
              expect(failedReason.message).to.be.equal(errorMessage);
              resolve();
            }),
          );
        });

        const parentFailure = new Promise<void>(resolve => {
          parentWorker.once('failed', async (job, failedReason, prev) => {
            expect(prev).to.be.equal('active');
            expect(failedReason.message).to.be.equal(
              `child ${prefix}:${queueName}:${children[0].job.id!} failed`,
            );
            resolve();
          });
        });
        await allFailed;
        await parentFailure;

        await worker2.close();
        await parentWorker.close();
        await parentQueue.close();
        await flow.close();
        await removeAllQueueData(new IORedis(redisHost), parentQueueName);
      });
    });

    describe('when continueParentOnFailure is provided as true', function () {
      it('should start processing parent when child is moved to failed', async function () {
        this.timeout(6000);
        const concurrency = 4;
        const parentQueueName = `parent-queue-${v4()}`;

        const parentQueue = new Queue(parentQueueName, {
          connection,
          prefix,
        });

        const flow = new FlowProducer({ connection, prefix });

        const worker = new Worker(
          queueName,
          async () => {
            return delay(10000);
          },
          {
            connection,
            prefix,
            lockDuration: 1000,
            stalledInterval: 100,
            maxStalledCount: 0,
            concurrency,
          },
        );

        const allActive = new Promise(resolve => {
          worker.on('active', after(concurrency, resolve));
        });

        await worker.waitUntilReady();

        const { job: parent } = await flow.add({
          name: 'parent-job',
          queueName: parentQueueName,
          data: {},
          children: [
            {
              name: 'test',
              data: { foo: 'bar' },
              queueName,
              opts: { continueParentOnFailure: true },
            },
          ],
        });

        const jobs = Array.from(Array(3).keys()).map(index => ({
          name: 'test',
          data: { index },
        }));

        await queue.addBulk(jobs);
        await allActive;
        await worker.close(true);

        const worker2 = new Worker(queueName, NoopProc, {
          connection,
          prefix,
          stalledInterval: 100,
          maxStalledCount: 0,
          concurrency,
        });

        const errorMessage = 'job stalled more than allowable limit';
        const allFailed = new Promise<void>((resolve, reject) => {
          worker2.on(
            'failed',
            after(concurrency, async (job, failedReason, prev) => {
              try {
                const parentState = await parent.getState();
                expect(parentState).to.be.equal('waiting');
                expect(prev).to.be.equal('active');
                expect(failedReason.message).to.be.equal(errorMessage);
                resolve();
              } catch (err) {
                reject(err);
              }
            }),
          );
        });

        await allFailed;

        await worker2.close();
        await parentQueue.close();
        await flow.close();
        await removeAllQueueData(new IORedis(redisHost), parentQueueName);
      });
    });

    describe('when ignoreDependencyOnFailure is provided as true', function () {
      it('should move parent to waiting when child is moved to failed and save child failedReason', async function () {
        this.timeout(6000);
        const concurrency = 4;
        const parentQueueName = `parent-queue-${v4()}`;

        const parentQueue = new Queue(parentQueueName, {
          connection,
          prefix,
        });

        const flow = new FlowProducer({ connection, prefix });

        const worker = new Worker(
          queueName,
          async () => {
            return delay(10000);
          },
          {
            connection,
            prefix,
            lockDuration: 1000,
            stalledInterval: 100,
            maxStalledCount: 0,
            concurrency,
          },
        );

        const allActive = new Promise(resolve => {
          worker.on('active', after(concurrency, resolve));
        });

        await worker.waitUntilReady();

        const { job: parent, children } = await flow.add({
          name: 'parent-job',
          queueName: parentQueueName,
          data: {},
          children: [
            {
              name: 'test',
              data: { foo: 'bar' },
              queueName,
              opts: { ignoreDependencyOnFailure: true },
            },
          ],
        });

        const jobs = Array.from(Array(3).keys()).map(index => ({
          name: 'test',
          data: { index },
        }));

        await queue.addBulk(jobs);
        await allActive;
        await worker.close(true);

        const worker2 = new Worker(queueName, NoopProc, {
          connection,
          prefix,
          stalledInterval: 100,
          maxStalledCount: 0,
          concurrency,
        });

        const errorMessage = 'job stalled more than allowable limit';
        const allFailed = new Promise<void>(resolve => {
          worker2.on(
            'failed',
            after(concurrency, async (job, failedReason, prev) => {
              const parentState = await parent.getState();

              expect(parentState).to.be.equal('waiting');
              expect(prev).to.be.equal('active');
              expect(failedReason.message).to.be.equal(errorMessage);
              resolve();
            }),
          );
        });

        await allFailed;
        const ignoredChildrenValues = await parent.getIgnoredChildrenFailures();
        expect(ignoredChildrenValues).to.deep.equal({
          [`${queue.qualifiedName}:${children[0].job.id}`]:
            'job stalled more than allowable limit',
        });

        await worker2.close();
        await parentQueue.close();
        await flow.close();
        await removeAllQueueData(new IORedis(redisHost), parentQueueName);
      });
    });

    describe('when removeDependencyOnFailure is provided as true', function () {
      it('should move parent to waiting when child is moved to failed', async function () {
        this.timeout(6000);
        const concurrency = 4;
        const parentQueueName = `parent-queue-${v4()}`;

        const parentQueue = new Queue(parentQueueName, {
          connection,
          prefix,
        });

        const flow = new FlowProducer({ connection, prefix });

        const worker = new Worker(
          queueName,
          async () => {
            return delay(10000);
          },
          {
            connection,
            prefix,
            lockDuration: 1000,
            stalledInterval: 100,
            maxStalledCount: 0,
            concurrency,
          },
        );

        const allActive = new Promise(resolve => {
          worker.on('active', after(concurrency, resolve));
        });

        await worker.waitUntilReady();

        const { job: parent } = await flow.add({
          name: 'parent-job',
          queueName: parentQueueName,
          data: {},
          children: [
            {
              name: 'test',
              data: { foo: 'bar' },
              queueName,
              opts: { removeDependencyOnFailure: true },
            },
          ],
        });

        const jobs = Array.from(Array(3).keys()).map(index => ({
          name: 'test',
          data: { index },
        }));

        await queue.addBulk(jobs);
        await allActive;
        await worker.close(true);

        const worker2 = new Worker(queueName, NoopProc, {
          connection,
          prefix,
          stalledInterval: 100,
          maxStalledCount: 0,
          concurrency,
        });

        const errorMessage = 'job stalled more than allowable limit';
        const allFailed = new Promise<void>(resolve => {
          worker2.on(
            'failed',
            after(concurrency, async (job, failedReason, prev) => {
              const parentState = await parent.getState();

              expect(parentState).to.be.equal('waiting');
              expect(prev).to.be.equal('active');
              expect(failedReason.message).to.be.equal(errorMessage);
              resolve();
            }),
          );
        });

        await allFailed;

        await worker2.close();
        await parentQueue.close();
        await flow.close();
        await removeAllQueueData(new IORedis(redisHost), parentQueueName);
      });
    });

    describe('when removeOnFail is provided as a number', function () {
      it('keeps the specified number of jobs in failed', async function () {
        this.timeout(6000);
        const concurrency = 4;

        const worker = new Worker(
          queueName,
          async () => {
            return delay(10000);
          },
          {
            connection,
            prefix,
            lockDuration: 1000,
            stalledInterval: 100,
            maxStalledCount: 0,
            concurrency,
          },
        );

        const allActive = new Promise(resolve => {
          worker.on('active', after(concurrency, resolve));
        });

        await worker.waitUntilReady();

        const jobs = Array.from(Array(4).keys()).map(index => ({
          name: 'test',
          data: { index },
          opts: {
            removeOnFail: 3,
          },
        }));

        await queue.addBulk(jobs);

        await allActive;

        await worker.close(true);

        const worker2 = new Worker(queueName, NoopProc, {
          connection,
          prefix,
          stalledInterval: 100,
          maxStalledCount: 0,
          concurrency,
        });

        const errorMessage = 'job stalled more than allowable limit';
        const allFailed = new Promise<void>(resolve => {
          worker2.on(
            'failed',
            after(concurrency, async (job, failedReason, prev) => {
              const failedCount = await queue.getFailedCount();
              expect(failedCount).to.equal(3);

              expect(job.data.index).to.be.equal(0);
              expect(prev).to.be.equal('active');
              expect(failedReason.message).to.be.equal(errorMessage);
              resolve();
            }),
          );
        });

        await allFailed;

        await worker2.close();
      });
    });

    describe('when removeOnFail is provided as boolean', function () {
      it('keeps the jobs with removeOnFail as false in failed', async function () {
        this.timeout(6000);
        const concurrency = 4;

        const worker = new Worker(
          queueName,
          async () => {
            return delay(10000);
          },
          {
            connection,
            prefix,
            lockDuration: 1000,
            stalledInterval: 100,
            maxStalledCount: 0,
            concurrency,
          },
        );

        const allActive = new Promise(resolve => {
          worker.on('active', after(concurrency, resolve));
        });

        await worker.waitUntilReady();

        const jobs = Array.from(Array(4).keys()).map(index => ({
          name: 'test',
          data: { index },
          opts: {
            removeOnFail: index % 2 == 1,
          },
        }));

        await queue.addBulk(jobs);

        await allActive;

        await worker.close(true);

        const worker2 = new Worker(queueName, NoopProc, {
          connection,
          prefix,
          stalledInterval: 100,
          maxStalledCount: 0,
          concurrency,
        });

        const errorMessage = 'job stalled more than allowable limit';
        const allFailed = new Promise<void>(resolve => {
          worker2.on(
            'failed',
            after(concurrency, async (job, failedReason, prev) => {
              expect(job?.attemptsStarted).to.be.equal(2);
              expect(job?.attemptsMade).to.be.equal(1);
              expect(job?.stalledCounter).to.be.equal(1);
              const failedCount = await queue.getFailedCount();
              expect(failedCount).to.equal(2);

              expect(prev).to.be.equal('active');
              expect(failedReason.message).to.be.equal(errorMessage);
              resolve();
            }),
          );
        });

        await allFailed;

        await worker2.close();
      });
    });

    describe('when removeOnFail is provided as a object', function () {
      it('keeps the specified number of jobs in failed respecting the age', async function () {
        this.timeout(6000);
        const concurrency = 4;

        const worker = new Worker(
          queueName,
          async job => {
            if (job.data.index < 2) {
              throw new Error('fail');
            }
            return delay(10000);
          },
          {
            connection,
            prefix,
            lockDuration: 1000,
            stalledInterval: 100,
            maxStalledCount: 0,
            concurrency,
          },
        );

        const allActive = new Promise(resolve => {
          worker.on('active', after(concurrency, resolve));
        });

        await worker.waitUntilReady();

        const jobs = Array.from(Array(4).keys()).map(index => ({
          name: 'test',
          data: { index },
          opts: {
            removeOnFail: {
              count: 4,
              age: 1,
            },
          },
        }));

        await queue.addBulk(jobs);

        await allActive;

        await worker.close(true);

        const worker2 = new Worker(queueName, NoopProc, {
          connection,
          prefix,
          stalledInterval: 100,
          maxStalledCount: 0,
          concurrency,
        });

        const errorMessage = 'job stalled more than allowable limit';
        const allFailed = new Promise<void>(resolve => {
          worker2.on('failed', async (job, failedReason, prev) => {
            if (job.id == '4') {
              const failedCount = await queue.getFailedCount();
              expect(failedCount).to.equal(2);

              expect(job.data.index).to.be.equal(3);
              expect(prev).to.be.equal('active');
              expect(failedReason.message).to.be.equal(errorMessage);
              resolve();
            }
          });
        });

        await allFailed;

        await worker2.close();
      });
    });
  });

  it('jobs not stalled while lock is extended', async function () {
    this.timeout(5000);
    const numJobs = 4;

    const concurrency = 4;

    const worker = new Worker(
      queueName,
      async () => {
        return delay(4000);
      },
      {
        connection,
        prefix,
        lockDuration: 100, // lockRenewTime would be half of it i.e. 500
        stalledInterval: 50,
        concurrency,
      },
    );

    const allActive = new Promise(resolve => {
      worker.on('active', after(concurrency, resolve));
    });

    const jobs = Array.from(Array(numJobs).keys()).map(index => ({
      name: 'test',
      data: { bar: `baz-${index}` },
    }));

    await queue.addBulk(jobs);

    await allActive;

    const worker2 = new Worker(queueName, NoopProc, {
      connection,
      prefix,
      stalledInterval: 50,
      concurrency,
    });

    const allStalled = new Promise(resolve =>
      worker2.on('stalled', after(concurrency, resolve)),
    );

    await delay(500); // Wait for jobs to become active

    const active = await queue.getActiveCount();
    expect(active).to.be.equal(4);

    await worker.close(true);

    await allStalled;

    await worker2.close();
  });
});
