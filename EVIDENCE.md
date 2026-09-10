# Evidence

- Structured output: `schema rejects invalid vision output` passes.
- Low confidence: `batch classifies 45 images, flags uncertainty, and records costs` verifies one flagged item.
- Background processing and cost attribution: the same test verifies 45 processed resources and 45 cost rows.
- Semantic matching: `semantic alias Vulpes vulpes ranks a fox first` passes.
- Mismatch guard: `mismatch guard rejects wolf on fox article with explanation` passes.
- Safe refusal: `no matching subject returns no confident match` passes.
- Idempotency: `job enqueue is idempotent` passes.
- Eval: `labeled evaluation reaches perfect top-1 precision` proves 10/10.
- Persistence/indexes: migrations in `src/db.js` create tenant indexes and durable tables.
- Boundary validation: malformed metadata and request inputs yield clean 4xx errors.

Run `npm test`; the checked-in expected result is 7 tests passed, 0 failed.
> **Evidence scope correction:** Test names below describe fixture tests only. They do not establish full capstone completion. See [REVIEW_STATUS.md](REVIEW_STATUS.md) for gaps.
