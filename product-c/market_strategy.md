# Riverside Books (Product C): Market and Feature Strategy

## Overview

Product C is the bookstore's customer-support layer. It answers routine questions using the
store's real inventory, hours, returns policy, and event schedule so a customer can ask
without waiting for a bookseller to become free.

The brief is more specific than most support-chat bot projects. This is not a generic AI helper
for "book recommendations" or a broad e-commerce chatbot. Product C's value is that it can say
whether a specific title is in stock right now, whether the store is open, and what the current
policy is, all using the store's actual data rather than a static FAQ.

That makes the product narrow, but also strategically important. A chatbot that answers the
same questions a human would answer on the phone is useful, but only if it is correct. The
hard part is not making conversation feel smart; it is telling the truth about a physical store
in real time.

## Who this actually competes with

### 0. The phone call (the incumbent)

The brief says customers call ahead to ask about stock, hours, return policy, and upcoming
events. That is the current workflow Product C replaces, and it is a strong incumbent in a lot
of ways.

A phone call is immediate, free, and works for customers who do not want to sign in or open a
site. A bookseller can also answer vague questions without a rigid interface, and can check
inventory by walking to the shelf. The call also has a useful side effect: the customer is
already in contact with the store.

Its weaknesses are specific and measurable:

- It only works when someone is available to answer.
- It interrupts the register and takes staff away from in-person customers.
- It repeats the same FAQ answers over and over.
- It leaves no structured record of popular questions.

Product C is strongest where those weaknesses are most visible: after hours, during busy periods,
and for repetitive questions that do not need a human to do a physical check.

### 1. Website FAQ pages and contact forms

Most small independent stores answer common support questions in a static FAQ or on a contact
form. These are low-cost and familiar, but they are poor fits for the store's real-time needs.

A website FAQ cannot answer "is that title on the shelf right now?" unless a person updates it
manually, which is exactly the problem the store has today. It also creates a bad experience for
customers: they must leave the page, navigate the site, and read a policy before they know
whether the answer is relevant.

Product C beats this on two axes:

- It can answer with actual store and inventory data rather than a stale static page.
- It reduces staff burden by collecting the most common questions in one intelligent interface.

### 2. Generic website chat widgets and AI support tools

Products like Intercom, Zendesk, and generic AI chat widgets are built to answer support
questions across many businesses. They are strong at helpdesk flows, escalation, and triage, but
they are not tuned to the bookstore's unique product truth problem.

A generic support bot can answer a return policy or store hours from a knowledge base, but it
will not know whether a specific title is physically in stock unless the bookstore connects it
to inventory data and gives it the right guardrails. That is the narrow wedge Product C is
trying to achieve.

### 3. Instagram DMs and WhatsApp messaging

A surprising amount of local retail traffic is routed through social messaging. This is the
closest thing to a direct competitor for the "ask a question on the same channel" experience.

The problem is that social messaging is not structured, and it is not a good place to store a
truthful answer about stock. It also creates a poor customer experience when the same answer is
asked repeatedly. If a customer messages the store on Instagram at 8:30pm and the answer is
"we're closed," it is still a form of support, but only the store can answer it and not without
manual attention.

### 4. Local search and Google Business answers

Google Business Profile and local search answers are often the first place a customer looks when
asking about hours or location. They are useful, but they are not part of the store's decision
logic, and they do not answer questions like "Is this specific title in stock?"

This is not a direct product competitor. It is the channel where the store already loses the
customer's intent before a visit ever starts.

## Feature comparison matrix

| | Phone call | FAQ page | Generic chatbot | Instagram DM | Google Business | **Product C** |
|---|---|---|---|---|---|---|
| Answers store hours | Yes | Yes | Yes | Yes | Yes | **Yes** |
| Answers return policy | Yes | Yes | Yes | Yes | Partial | **Yes** |
| Answers event schedule | Yes | Yes | Yes | Yes | Partial | **Yes** |
| Answers title stock status | Yes, if staff check | No | Only if connected | No | No | **Yes, using current data** |
| Works outside store hours | No | Yes | Yes | Sometimes | Yes | **Yes** |
| Responds instantly | Usually | Yes | Yes | Often | Yes | **Yes** |
| Reduces staff load | Limited | Partial | Yes | Limited | N/A | **Yes** |
| Uses real inventory data | Yes, by human | No | If integrated | No | No | **Yes** |
| Requires login | No | No | Usually no | No | No | **No, for browse** |
| Handles vague questions | Yes | No | Partial | Yes | Partial | **Yes, with guardrails** |

The most important comparison is not simple support volume. It is truthfulness. Product C can
only win if it answers inventory and policy questions in a way customers trust.

## The truth problem

This may be the most important strategic fact in this product.

A support bot that says a title is in stock is only useful if it is telling the truth about the
physical shelf. Product A's stock data is already the main risk in the product suite. Product C
depends on that truth being available, because it will otherwise answer from stale or guessed
inventory records.

Three design consequences follow:

1. **Inventory answers must be sourced from the system of record, not the chatbot itself.** The
   bot is a presentation layer over the store's current stock state.
2. **The chatbot should answer with explicit confidence and time context.** "It looks like this
   title is on the shelf" is not the same as "it is currently in stock." The bot should expose
   age of stock data in a readable way.
3. **The bot should defer to staff when confidence is low.** If inventory data is stale or the
   store is uncertain, it should say so and route to a human instead of pretending certainty.

This is a sharp boundary between a useful product and a dangerous one. A chatbot that guesses
stock is worse than a static FAQ, because it creates a false sense of certainty.

## Pain point mapping

The brief lists five pain points, and Product C addresses a clear subset.

**Owned: common customer questions pull staff away from the register.** This is Product C's core
job. Store hours, return policy, and event schedule are all good support tasks for a chatbot.

**Owned: customers need to know if a title is in stock before driving to the store.** This is the
highest-value support flow and the reason the product is different from generic support bots.

**Partial: customers ask about titles and inventory without staff being free.** Product C helps for
repeatable support questions, but it cannot replace a human physically checking a shelf unless the
inventory layer is sufficiently trustworthy.

**Not ours: no loyalty system** belongs to Product A. **Inconsistent social captions** belongs to
Product D. **Inventory tracking and low-stock alerts** belong to Product B.

## Product C's natural wedge

The product's strongest value proposition is not "AI customer support." It is much narrower and
more defensible:

- A customer asks on the website or via chat: "Do you have this title in stock?"
- The bot answers from live inventory and a clear freshness signal.
- It can also handle simple policy questions without interrupting staff.

That wedge is real for a store whose customers still browse in person and call ahead. It builds
on the store's existing behavior instead of replacing it with a large e-commerce workflow.

## Feature comparison by use case

### 1. Stock check

This is the highest-value use case. A customer asks, "Do you have [title] right now?" The bot
should answer from current inventory and a freshness timestamp, ideally with a direct route to the
reservation flow in Product A if the title is available.

This requires a clean shared data contract with Product B and Product A. Product C should not be
writing inventory assumptions on its own.

### 2. Hours and policies

These are safe, standard FAQ flows. The bot can answer quickly and route to a human if the
question is more nuanced or the customer needs to speak with a bookseller.

### 3. Event questions

"Is the author event tonight?" "Do you have tickets?" "How long does the event last?" These are
highly relevant support questions, but they cross into the store's operations layer. Product C
should answer them from event data if those records exist; otherwise it should route to staff.

### 4. Return and exchange questions

This is a good support case for a bot, but the policy has to be explicit and current. This is a
place where a chatbot can create liability if it gives a policy answer that is out of date.

## Scope: what Product C will not do

- **No general-purpose customer assistant** for broad literary recommendations. That belongs in a
  different product or a much larger platform.
- **No book ordering workflow** beyond answering whether a title is in stock or whether staff can
  prepare a pickup.
- **No staff scheduling or inventory management**. That is Product B.
- **No social caption writing**. That is Product D.
- **No payment support or risky transactional logic**. The bot should not handle money, refunds,
  or order modifications unless those capabilities are deliberately built elsewhere.

## Open questions

- What is the exact source of truth for current stock and event data? This is a shared data issue
  across Products A, B, and C.
- Should the chatbot be website-only, or also available on Instagram/WhatsApp as a support surface?
- How far should it go on vague questions like "Do you have anything by this author?" The answer
  is helpful only if it is framed honestly and not mistaken for a precise stock guarantee.
- Is the bookstore comfortable with a bot answering stock questions at all hours when the product
  is still relying on staff-maintained inventory updates?
- Does the owner want a human handoff button for every question, or only for the most ambiguous
  and risky cases?

## Verification status

Like Product A, this document does not claim a market survey has been completed. The competitor set
is drawn from the brief and from the common support tools used by small retailers, not from a formal
research study. Any pricing or feature claims tied to named commercial products should be treated as
unverified until someone checks the current product page or support documentation.

The strategic claim to keep is simple: Product C is solving the bookstore's repeated support demand
and the truthfulness problem around stock and policy answers, not trying to become a large general
AI assistant.
