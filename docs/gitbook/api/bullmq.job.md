<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [bullmq](./bullmq.md) &gt; [Job](./bullmq.job.md)

## Job class

<b>Signature:</b>

```typescript
export declare class Job<DataType = any, ReturnType = any, NameType extends string = string> 
```

## Constructors

|  Constructor | Modifiers | Description |
|  --- | --- | --- |
|  [(constructor)(queue, name, data, opts, id)](./bullmq.job._constructor_.md) |  | Constructs a new instance of the <code>Job</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [attemptsMade](./bullmq.job.attemptsmade.md) |  | number | Number of attempts after the job has failed. |
|  [data](./bullmq.job.data.md) |  | DataType | The payload for this job. |
|  [failedReason](./bullmq.job.failedreason.md) |  | string | Reason for failing. |
|  [finishedOn?](./bullmq.job.finishedon.md) |  | number | <i>(Optional)</i> Timestamp for when the job finished (completed or failed). |
|  [id?](./bullmq.job.id.md) |  | string | <i>(Optional)</i> |
|  [name](./bullmq.job.name.md) |  | NameType | The name of the Job |
|  [opts](./bullmq.job.opts.md) |  | [JobsOptions](./bullmq.jobsoptions.md) | The options object for this job. |
|  [parent?](./bullmq.job.parent.md) |  | [ParentKeys](./bullmq.parentkeys.md) | <i>(Optional)</i> Object that contains parentId (id) and parent queueKey. |
|  [parentKey?](./bullmq.job.parentkey.md) |  | string | <i>(Optional)</i> Fully qualified key (including the queue prefix) pointing to the parent of this job. |
|  [prefix](./bullmq.job.prefix.md) |  | string |  |
|  [processedOn?](./bullmq.job.processedon.md) |  | number | <i>(Optional)</i> Timestamp for when the job was processed. |
|  [progress](./bullmq.job.progress.md) |  | number \| object | The progress a job has performed so far. |
|  [queue](./bullmq.job.queue.md) |  | [MinimalQueue](./bullmq.minimalqueue.md) |  |
|  [queueName](./bullmq.job.queuename.md) |  | string |  |
|  [returnvalue](./bullmq.job.returnvalue.md) |  | ReturnType | The value returned by the processor when processing this job. |
|  [stacktrace](./bullmq.job.stacktrace.md) |  | string\[\] | Stacktrace for the error (for failed jobs). |
|  [timestamp](./bullmq.job.timestamp.md) |  | number | Timestamp when the job was created (unless overridden with job options). |
|  [toKey](./bullmq.job.tokey.md) |  | (type: string) =&gt; string |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [addJob(client, parentOpts)](./bullmq.job.addjob.md) |  | Adds the job to Redis. |
|  [asJSON()](./bullmq.job.asjson.md) |  | Prepares a job to be serialized for storage in Redis. |
|  [asJSONSandbox()](./bullmq.job.asjsonsandbox.md) |  | Prepares a job to be passed to Sandbox. |
|  [changeDelay(delay)](./bullmq.job.changedelay.md) |  | Change delay of a delayed job. |
|  [create(queue, name, data, opts)](./bullmq.job.create.md) | <code>static</code> | Creates a new job and adds it to the queue. |
|  [createBulk(queue, jobs)](./bullmq.job.createbulk.md) | <code>static</code> | Creates a bulk of jobs and adds them atomically to the given queue. |
|  [discard()](./bullmq.job.discard.md) |  | Marks a job to not be retried if it fails (even if attempts has been configured) |
|  [extendLock(token, duration)](./bullmq.job.extendlock.md) |  | Extend the lock for this job. |
|  [fromId(queue, jobId)](./bullmq.job.fromid.md) | <code>static</code> | Fetches a Job from the queue given the passed job id. |
|  [fromJSON(queue, json, jobId)](./bullmq.job.fromjson.md) | <code>static</code> | Instantiates a Job from a JobJsonRaw object (coming from a deserialized JSON object) |
|  [getChildrenValues()](./bullmq.job.getchildrenvalues.md) |  | Get this jobs children result values if any. |
|  [getDependencies(opts)](./bullmq.job.getdependencies.md) |  | Get children job keys if this job is a parent and has children. |
|  [getDependenciesCount(opts)](./bullmq.job.getdependenciescount.md) |  | Get children job counts if this job is a parent and has children. |
|  [getState()](./bullmq.job.getstate.md) |  | Get current state. |
|  [isActive()](./bullmq.job.isactive.md) |  |  |
|  [isCompleted()](./bullmq.job.iscompleted.md) |  |  |
|  [isDelayed()](./bullmq.job.isdelayed.md) |  |  |
|  [isFailed()](./bullmq.job.isfailed.md) |  |  |
|  [isWaiting()](./bullmq.job.iswaiting.md) |  |  |
|  [isWaitingChildren()](./bullmq.job.iswaitingchildren.md) |  |  |
|  [log(logRow)](./bullmq.job.log.md) |  | Logs one row of log data. |
|  [moveToCompleted(returnValue, token, fetchNext)](./bullmq.job.movetocompleted.md) |  | Moves a job to the completed queue. Returned job to be used with Queue.prototype.nextJobFromJobData. |
|  [moveToDelayed(timestamp)](./bullmq.job.movetodelayed.md) |  | Moves the job to the delay set. |
|  [moveToFailed(err, token, fetchNext)](./bullmq.job.movetofailed.md) |  | Moves a job to the failed queue. |
|  [moveToWaitingChildren(token, opts)](./bullmq.job.movetowaitingchildren.md) |  | Moves the job to the waiting-children set. |
|  [promote()](./bullmq.job.promote.md) |  | Promotes a delayed job so that it starts to be processed as soon as possible. |
|  [remove()](./bullmq.job.remove.md) |  | Completely remove the job from the queue. Note, this call will throw an exception if the job is being processed when the call is performed. |
|  [retry(state)](./bullmq.job.retry.md) |  | Attempts to retry the job. Only a job that has failed or completed can be retried. |
|  [toJSON()](./bullmq.job.tojson.md) |  |  |
|  [update(data)](./bullmq.job.update.md) |  | Updates a job's data |
|  [updateProgress(progress)](./bullmq.job.updateprogress.md) |  | Updates a job's progress |
|  [waitUntilFinished(queueEvents, ttl)](./bullmq.job.waituntilfinished.md) |  | Returns a promise the resolves when the job has completed (containing the return value of the job), or rejects when the job has failed (containing the failedReason). |
