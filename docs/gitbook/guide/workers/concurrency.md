# Concurrency

There are basically two ways to achieve concurrency with BullMQ using Worker instances. You can run a worker with a concurrency factor larger than 1 (which is the default value), or you can run several workers in different node processes.

#### Local Concurrency factor

The local concurrency factor is a worker option that determines how many jobs are allowed to be processed concurrently (or in parallel if using sandboxed processors) for that instance. This means that the same worker is able to process several jobs at the same time and still provide guarantees such as "at-least-once" and order of processing.

```typescript
import { Worker, Job } from 'bullmq';

const worker = new Worker(
  queueName,
  async (job: Job) => {
    // Do something with job
    return 'some value';
  },
  { concurrency: 50 },
);
```

{% hint style="info" %}
Note that the concurrency is only possible when workers perform asynchronous operations such as a call to a database or a external HTTP service, as this is how node supports concurrency natively. If your workers are very CPU intensive it is better to use [Sandboxed processors](sandboxed-processors.md).
{% endhint %}

In addition, you can update the concurrency value as you need while your worker is running:

```typescript
worker.concurrency = 5;
```

#### Multiple workers

The other way to achieve concurrency is to provide multiple workers. This is the recommended way to setup BullMQ as besides providing concurrency it also provides higher availability for your workers. You can easily launch a fleet of workers running in many different machines in order to execute the jobs in parallel in a predictable and robust way.

{% hint style="info" %}
If you need to achieve a global concurrency of at most 1 job at a time, refer to [Global concurrency](../queues/global-concurrency.md).
{% endhint %}

You can still (and it is a perfectly good practice to) choose a high concurrency factor for every worker, so that the resources of every machine where the worker is running are used more efficiently.
