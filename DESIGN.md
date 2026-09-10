# Design

Problem: content teams can find a visually similar image that is semantically wrong. The service must confidently match a bounded wildlife library to articles and refuse unsafe pairings.

The HTTP layer validates and authenticates requests, `ImageService` owns workflow policy, provider/embedding/guard modules own AI decisions, and SQLite owns durable state. Images, posts, jobs, costs, and reviewable suggestions are tenant-scoped. The explicit non-goal is a general-purpose image search product.

The offline fixture provider represents pre-generated vision metadata, an approach explicitly accepted in the capstone Q&A when free vision quotas are unavailable. Its output still passes the same schema validation, confidence, background-job, retry, cost, and guard paths used by a cloud provider.
