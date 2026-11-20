import worker from '../../src/worker/index.js';

export const onRequest = (context) => worker.fetch(context.request, context.env, context);
