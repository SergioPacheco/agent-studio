# Architecture-aware stage refactor

Goal: Make architecture selection and real execution visible with existing 3D characters.
Design approved by request: retain 3D characters, take inspiration from Muvuca's spatial organization and state badges, implement original code and styles.

- [x] Add pure stage model: layouts for five architectures, explicit dependency links, real active task states, support agents, domain grouping and bounded preview fixtures.
- [x] Refactor stage/map and inspector; show architecture rationale, contracts and current work, respecting keyboard and reduced motion.
- [x] Add six no-cost visual previews; test all topologies, phantom activity, blocked gates, responsive UI and existing browser flow.
- [x] Verify and publish on the existing PR; preserve execution/approval behavior.

Constraints: planned edges are not claimed as sent messages. Domain labels are not new agents. Previews are explicitly simulations. No external character assets or source code copied. No automatic architecture override without replanning.

Review fixes: case preview explicitly takes precedence and has a return action; approvals hidden during preview. Integration gets its own row; large networks use a grid. Active dependency labels track the active task, not an earlier delivery. Regression tests added. Browser verification runs in GitHub Actions because local Chromium binaries are unavailable and browser CDN is blocked.
