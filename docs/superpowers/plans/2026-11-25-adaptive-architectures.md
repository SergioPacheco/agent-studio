# Adaptive architectures implementation plan

Goal: Six selectable classroom cases and model-selected architecture for free requests.
Architecture: Shared scenario catalog, validated architecture metadata, dependency-aware execution and visible approval. Preserve existing demo and provider permissions.

- [x] Add catalog and architecture validation; test six expected choices and malformed plans.
- [x] Integrate model planning, task output handoffs and architecture execution constraints.
- [x] Expose cases and rationale in UI; document simulation versus real execution.
- [x] Run checks and regression suite; publish reviewable branch and PR.

Constraints: no automatic provider spending, no fake audits, preserve human plan/diff approvals. Network max three debate rounds; hierarchical tasks identify a domain; all connections have delivery contracts. Single agent tasks use one executor; the existing independent reviewer remains a quality gate. Tests and approvals remain external gates.

Verification: npm run check; npm test (40 passed, 1 optional Docker test skipped before final additions). Final review identified report-only validation, blocking gates, degenerate topologies, contracts and consolidation; fixed with regression coverage. No real provider calls or real audits performed.
