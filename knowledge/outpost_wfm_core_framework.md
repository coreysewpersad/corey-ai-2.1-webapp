# Outpost WFM Core Advisory Frameworks (Starter Knowledge Document)

> Note: Drop your own WFM source documents (`.md`, `.txt`, `.pdf`, `.csv`, `.json`) into the `/knowledge` directory—or upload them in the Knowledge Base panel—to index them into the Gemini File Search Store.

## 1. The Outpost WFM Four-Pillar Diagnostic Model

Outpost WFM structures Workforce Management operations into four interconnected pillars. Whenever diagnosing service-level degradation, occupancy swings, or cost-to-serve inflation, evaluate all four in sequence before adjusting staffing targets:

1. **Forecasting & Demand Intelligence**
   - Distinguish structural volume drivers (billing cycles, product launches, seasonal peaks) from transient anomalies.
   - Measure forecast accuracy at both weekly and 30-minute interval levels using MAPE (Mean Absolute Percentage Error) and WAPE (Weighted Absolute Percentage Error).
   - Target benchmark: < 5% interval MAPE for mature voice/chat queues; < 3% weekly aggregate variance.

2. **Capacity Planning & Shrinkage Architecture**
   - Separate **Planned Shrinkage** (PTO, training, coaching, town halls, scheduled breaks) from **Unplanned Shrinkage** (absenteeism, tardiness, system downtime, unplanned aux time).
   - Never apply a single flat shrinkage assumption across BPO sites or channels; model shrinkage by tenure cohort, site, and shift window.
   - Build explicit ramp curves for new-hire cohorts (typically 4–8 weeks to reach 90%+ target AHT and concurrency parity).

3. **Scheduling, Erlang-C & Intraday Real-Time Management (RTM)**
   - Use Erlang-C (or simulation for multi-skill blended queues) at 15- or 30-minute intervals rather than daily averages.
   - Maintain clear interval-level escalation thresholds: e.g., triggers at Service Level < 70% over two consecutive intervals or Abandonment > 6%.
   - Separate tactical intraday actions (VTO/OT offers, offline reallocation, skill priority adjustments) from structural schedule-fit issues.

4. **Governance, WFM Auditing & BPO Performance Alignment**
   - Audit BPO vendor billing models (productive hour vs. logged-in hour vs. handled minute) against actual adherence, shrinkage cap clauses, and SLA penalties/bonuses.
   - Standardize metric definitions across internal operations and BPO partners so AHT, Occupancy, Schedule Adherence, and Shrinkage mean the exact same thing in every MBR/QBR.

## 2. Core WFM Formulas & Operational Guardrails

- **Shrinkage-Adjusted Staffing Requirement**:
  `Required Rostered FTE = Base Productive FTE / (1 - Total Shrinkage Rate)`
  Example: If Erlang-C requires 85 productive agents and total shrinkage is 28% (0.28), rostered requirement = `85 / 0.72 = 118.06 FTE`.
- **Occupancy Ceiling Guardrail**:
  Sustained interval occupancy above **85%–88%** in high-complexity voice queues accelerates burnout, drives unplanned shrinkage upward within 3–6 weeks, and inflates AHT.
- **Schedule Adherence vs. Conformance**:
  - **Conformance** = `(Actual Worked Time / Scheduled Time) * 100` (volume/hours view).
  - **Adherence** = `% of scheduled intervals spent in the exact assigned activity` (interval timing view). High conformance with low adherence indicates off-schedule shift swapping or break drifting that breaks interval Service Level.

## 3. Outpost WFM Advisory Engagements

Outpost WFM partners with Customer Experience, Support, and BPO Operations leaders on three core engagements:

- **Comprehensive WFM Audit**: End-to-end diagnostic of forecasting models, shrinkage governance, Erlang/capacity assumptions, intraday playbooks, and BPO contract alignment. Delivers a prioritized 30-60-90 day remediation roadmap.
- **WFM Team Training & Upskilling**: Hands-on capability building for WFM analysts, planners, and real-time managers—covering forecasting methodology, capacity modeling, shrinkage control, and stakeholder communication.
- **BPO Performance & Governance Optimization**: Realigning vendor scorecards, interval delivery accountability, staffing buffer governance, and SLA/cost-to-serve mechanics across outsourced networks.
