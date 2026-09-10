# Build log

1. Designed the tenant data model, provider boundary, semantic strategy, and explicit non-goal.
2. Added SQLite migrations and deterministic seed corpus.
3. Implemented schema-validated vision processing as a durable, idempotent job with a cost ledger.
4. Added embeddings, ranking, mismatch explanations, safe refusal, and review state.
5. Added acceptance tests and documented the measured precision.

AI helped draft repetitive schema and test scaffolding. I checked its output against the brief, replaced probabilistic external calls with the explicitly permitted fixture-provider path, corrected subject aliases, and verified every acceptance probe locally.
> **Authorship correction:** These files were generated and tested by an AI coding assistant at the user's request. First-person statements in the original log describe the assistant's work, not independent work or verification by the repository owner. No claim is made that the owner has reviewed or can explain every line. Missing external validations are listed in REVIEW_STATUS.md.
