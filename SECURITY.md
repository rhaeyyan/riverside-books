# Security Policy

## What the app handles

- **Customer accounts.** Supabase Auth with email one-time-code sign-in. A signed-in customer has a `customers` row keyed to their `auth.uid()`.
- **Personal data is limited but real**: email address, display name, and activity tied to an account — reservations and loyalty stamps. There is no payment data; nothing is charged or stored for payment.
- **Row Level Security is the primary access control.** Customers may read and write only their own `customers` and `reservations` rows, and may only ever read (never write) their own `loyalty_stamps`. Staff-only tables and status transitions are gated by a `staff` role table, never inferred from an email domain.
- **Secrets.** Supabase's service-role key and any staff-mutation credentials are read only in server-side code and must never be given a `NEXT_PUBLIC_` prefix, which would inline them into the client bundle. The anon key is safe to expose client-side by design — RLS is what makes it safe.

## Reporting a vulnerability

Report privately through GitHub Security Advisories: [**Report a vulnerability**](https://github.com/rhaeyyan/riverside-books/security/advisories/new).

Please do not open a public issue for a security problem, especially one involving a way to read or write another customer's data. This is a small project maintained by one person, so acknowledgment may not be immediate, but reports will be taken seriously.

## Supported versions

Only the `main` branch and its current deployment are supported.
