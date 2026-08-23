# Delivery methodologies and the roles they imply

The methodology is not decoration — it determines **who exists**, **what a decision requires**,
and **when work is allowed to move**. A Scrum team has no Change Control Board; a Waterfall
project has no Sprint Retrospective; a Kanban service has no sprint at all. Picking roles before
picking a methodology produces a committee that cannot actually decide anything, because nobody
knows what a decision *is* on this project.

Pick one primary methodology. Hybrids are real and common (Scrum for delivery, Kanban for
support, phase gates for compliance) — name the hybrid explicitly rather than silently mixing
ceremonies from three traditions.

---

## Scrum

**Use when** work is discovered as it is built, the team is 5–9 people, and a fixed cadence helps
more than it constrains.

| Role | Authority |
|---|---|
| **Product Owner** | Sole owner of backlog priority. Accepts or rejects work. Cannot be overruled on *what*. |
| **Scrum Master** | Owns the process, not the people. Removes impediments. Cannot assign work. |
| **Development Team** | Self-organising. Owns *how*, and owns the estimate. Collectively accountable. |
| **Stakeholders** | Consulted at Sprint Review. No authority inside the sprint. |

**A decision is made** at Sprint Planning (commitment), Sprint Review (acceptance), or
Retrospective (process change). Mid-sprint scope change is the anti-pattern — that is what the
next sprint is for.

**Watch for:** a Product Owner who does not actually have authority; a Scrum Master who is really
a project manager; retrospective actions nobody checks at the next retrospective.

---

## Kanban

**Use when** work arrives unpredictably (support, platform, ops), priorities change faster than a
sprint, or the team is small enough that ceremony costs more than it returns.

| Role | Authority |
|---|---|
| **Service Delivery Manager** | Owns flow — WIP limits, cycle time, blockers. |
| **Service Request Manager** | Owns what enters the queue and in what order. |
| **Team members** | Pull work; nobody assigns it. |

**A decision is made** continuously, at the point of pull, bounded by WIP limits. There is no
commitment ceremony because there is no sprint. Change is expected, not exceptional.

**Watch for:** WIP limits that exist on the board but are routinely exceeded; "Kanban" used to
mean "no process".

---

## SAFe (Scaled Agile Framework)

**Use when** multiple teams must ship one thing together, typically 50+ people, and alignment
costs more than local speed.

| Role | Authority |
|---|---|
| **Release Train Engineer (RTE)** | Chief Scrum Master for the train. Owns PI execution. |
| **Product Management** | Owns the programme backlog and features — above team Product Owners. |
| **System Architect** | Owns architectural runway and non-functional requirements across teams. |
| **Business Owners** | Own value and PI objectives. Sign off at PI Planning. |
| **Epic Owner** | Shepherds a single large initiative through the portfolio. |

**A decision is made** at PI Planning (a 2-day, whole-train commitment), at ART Sync, or at the
System Demo. Between those, teams run Scrum or Kanban locally.

**Watch for:** SAFe adopted for a team of eight, where the coordination machinery costs more than
the coordination it buys. This is the most commonly over-applied methodology on the list.

---

## Waterfall / Stage-Gate

**Use when** the cost of change late is very high (regulated, safety-critical, hardware,
fixed-price contract) and requirements genuinely can be known up front.

| Role | Authority |
|---|---|
| **Project Manager** | Owns plan, budget, schedule. Directive, not facilitative. |
| **Business Analyst** | Owns requirements as a signed baseline. |
| **Solution Architect** | Owns design, signed off before build begins. |
| **Development Lead** | Owns build against the signed design. |
| **QA Lead** | Owns test phase; gates release. |
| **Change Control Board** | The only body that may alter a signed baseline. |

**A decision is made** at a phase gate, in writing, with named sign-off. Work does not proceed to
the next phase until the gate is passed. Changing a baseline requires a change request, not a
conversation.

**Watch for:** the gate treated as a formality that nobody may fail; "agile" work with waterfall
reporting bolted on top, which produces the ceremony cost of both and the benefits of neither.

---

## CI/CD — continuous delivery as an operating model

Not a planning methodology; a **delivery** one. It layers on top of Scrum or Kanban and changes
who decides that something is releasable.

| Role | Authority |
|---|---|
| **Release Manager** | Owns what is safe to ship *now*. May block a release. |
| **DevOps / SRE** | Owns the pipeline and production health. Owns rollback. |
| **AppSec Engineer** | Owns the security gate. May block a release for an unfixed finding. |
| **Service Owner** | Accountable for the service in production, on call for it. |

**A decision is made** by the pipeline where it can be automated, and by a named human where it
cannot. The central question is not "is it finished" but "is it safe to release, and can we get
back if it isn't".

**Watch for:** a pipeline whose green result does not exercise the code under change — a check
that measures its own existence rather than the thing it claims to measure.

---

## Choosing, and saying so

State the methodology, the roles it activates, and what counts as a decision, before reviewing
anything. Two sentences is enough:

> *Kanban, because work here arrives unpredictably. Active roles: Service Delivery Manager
> (flow), Service Request Manager (intake), team members (pull). A decision is made at the point
> of pull, bounded by a WIP limit of 3.*

If the project's own documents already declare a methodology and a role set, that is the answer —
adopt it rather than proposing a parallel structure that ignores the team's own governance.
