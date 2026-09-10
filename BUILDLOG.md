# Build log

1. Designed the tenant data model, provider boundary, semantic strategy, and explicit non-goal.
2. Added SQLite migrations and deterministic seed corpus.
3. Implemented schema-validated vision processing as a durable, idempotent job with a cost ledger.
4. Added embeddings, ranking, mismatch explanations, safe refusal, and review state.
5. Added acceptance tests and documented the measured precision.

AI helped draft repetitive schema and test scaffolding. I checked its output against the brief, replaced probabilistic external calls with the explicitly permitted fixture-provider path, corrected subject aliases, and verified every acceptance probe locally.
