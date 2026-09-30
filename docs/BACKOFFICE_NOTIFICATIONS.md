# Notifications

Notifications received by Super Admin, Staff, franchise Admin, franchise Employee, Partner, and User (customer).

Active users only. The person who triggered the event is not notified.

Back-office roles: inbox only. Partner and User: inbox and mobile push.

---

## Super Admin

All franchises.

| # | Event | When |
|---|---|---|
| 1 | `CATEGORY_REQUEST_SUBMITTED` | New category requested |
| 2 | `SERVICE_REQUEST_SUBMITTED` | New service requested |
| 3 | `EMPLOYEE_ADDED` | Employee created |
| 4 | `EXPENSE_CREATED` | Expense recorded |
| 5 | `CUSTOMER_ACCOUNT_DELETED` | Customer deleted their account |
| 6 | `BACKOFFICE_QUOTE_CREATED` | Quote created |
| 7 | `BACKOFFICE_QUOTE_STATUS_CHANGED` | Quote accepted or failed |
| 8 | `BACKOFFICE_ORDER_CREATED` | Order created |
| 9 | `BACKOFFICE_ORDER_STATUS_CHANGED` | Order completed, cancelled, or refunded |
| 10 | `BACKOFFICE_CUSTOMER_PAYMENT_RECEIVED` | Customer payment completed |
| 11 | `BACKOFFICE_PARTNER_PAYMENT_RECEIVED` | Partner payment completed |
| 12 | `PARTNER_PENDING_VERIFICATION` | Partner waiting for verification |
| 13 | `BACKOFFICE_SUBSCRIPTION_CHANGED` | Partner subscription assigned, changed, or paid |
| 14 | `PARTNER_POST_PENDING_REVIEW` | Partner submitted a post for review |
| 15 | `BACKOFFICE_ORDER_REVIEW_RECEIVED` | Customer rated a partner |
| 16 | `PARTNER_ACCOUNT_DELETED` | Partner deleted their account |
| 17 | `QUOTE_ACTION_REMINDER` | Quote in new status too long |
| 18 | `QUOTE_CREATED` | This user created the quote |
| 19 | `QUOTE_STATUS_CHANGED` | This user created the quote |
| 20 | `TICKET_STATUS_CHANGED` | This user created the ticket |

---

## Staff

All franchises. Same list as Super Admin.

| # | Event | When |
|---|---|---|
| 1 | `CATEGORY_REQUEST_SUBMITTED` | New category requested |
| 2 | `SERVICE_REQUEST_SUBMITTED` | New service requested |
| 3 | `EMPLOYEE_ADDED` | Employee created |
| 4 | `EXPENSE_CREATED` | Expense recorded |
| 5 | `CUSTOMER_ACCOUNT_DELETED` | Customer deleted their account |
| 6 | `BACKOFFICE_QUOTE_CREATED` | Quote created |
| 7 | `BACKOFFICE_QUOTE_STATUS_CHANGED` | Quote accepted or failed |
| 8 | `BACKOFFICE_ORDER_CREATED` | Order created |
| 9 | `BACKOFFICE_ORDER_STATUS_CHANGED` | Order completed, cancelled, or refunded |
| 10 | `BACKOFFICE_CUSTOMER_PAYMENT_RECEIVED` | Customer payment completed |
| 11 | `BACKOFFICE_PARTNER_PAYMENT_RECEIVED` | Partner payment completed |
| 12 | `PARTNER_PENDING_VERIFICATION` | Partner waiting for verification |
| 13 | `BACKOFFICE_SUBSCRIPTION_CHANGED` | Partner subscription assigned, changed, or paid |
| 14 | `PARTNER_POST_PENDING_REVIEW` | Partner submitted a post for review |
| 15 | `BACKOFFICE_ORDER_REVIEW_RECEIVED` | Customer rated a partner |
| 16 | `PARTNER_ACCOUNT_DELETED` | Partner deleted their account |
| 17 | `QUOTE_ACTION_REMINDER` | Quote in new status too long |
| 18 | `QUOTE_CREATED` | This user created the quote |
| 19 | `QUOTE_STATUS_CHANGED` | This user created the quote |
| 20 | `TICKET_STATUS_CHANGED` | This user created the ticket |

---

## Franchise Admin

Their franchise only.

| # | Event | When |
|---|---|---|
| 1 | `PARTNER_PENDING_VERIFICATION` | Partner waiting for verification |
| 2 | `BACKOFFICE_SUBSCRIPTION_CHANGED` | Partner subscription assigned, changed, or paid |
| 3 | `PARTNER_POST_PENDING_REVIEW` | Partner submitted a post for review |
| 4 | `BACKOFFICE_ORDER_REVIEW_RECEIVED` | Customer rated a partner |
| 5 | `PARTNER_ACCOUNT_DELETED` | Partner deleted their account |
| 6 | `QUOTE_ACTION_REMINDER` | Quote in new status too long |
| 7 | `CATALOG_REQUEST_REVIEWED` | Category or service request approved or rejected |
| 8 | `BACKOFFICE_CHAT_MESSAGE_RECEIVED` | New chat message |
| 9 | `QUOTE_CREATED` | Quote created |
| 10 | `QUOTE_STATUS_CHANGED` | Quote status changed |
| 11 | `ORDER_CREATED` | Order created |
| 12 | `ORDER_STATUS_CHANGED` | Order status changed |
| 13 | `ORDER_CANCELLED` | Order cancelled |
| 14 | `ORDER_SERVICE_STATUS_CHANGED` | Service status changed |
| 15 | `ORDER_SERVICE_CANCELLED` | Service cancelled |
| 16 | `ORDER_PAYMENT_RECEIVED` | Payment received |
| 17 | `ORDER_ADDITIONAL_CHARGE_ADDED` | Extra charge added |
| 18 | `ORDER_ADDITIONAL_CHARGE_UPDATED` | Extra charge updated |
| 19 | `ORDER_ADDITIONAL_CHARGE_REMOVED` | Extra charge removed |
| 20 | `ORDER_REFUND_PROCESSED` | Refund processed |
| 21 | `SUBSCRIPTION_ASSIGNED` | Plan assigned to a partner |
| 22 | `SUBSCRIPTION_STATUS_CHANGED` | Partner subscription status changed |
| 23 | `TICKET_STATUS_CHANGED` | This user created the ticket |
| 24 | `DISPUTE_RAISED` | This user is assigned on the dispute |

---

## Franchise Employee

Their franchise only.

Every employee:

| # | Event | When |
|---|---|---|
| 1 | `PARTNER_PENDING_VERIFICATION` | Partner waiting for verification |
| 2 | `BACKOFFICE_SUBSCRIPTION_CHANGED` | Partner subscription assigned, changed, or paid |
| 3 | `PARTNER_POST_PENDING_REVIEW` | Partner submitted a post for review |
| 4 | `BACKOFFICE_ORDER_REVIEW_RECEIVED` | Customer rated a partner |
| 5 | `PARTNER_ACCOUNT_DELETED` | Partner deleted their account |
| 6 | `CATALOG_REQUEST_REVIEWED` | Category or service request approved or rejected |
| 7 | `BACKOFFICE_CHAT_MESSAGE_RECEIVED` | New chat message |
| 8 | `QUOTE_ACTION_REMINDER` | Quote in new status too long |
| 9 | `TICKET_STATUS_CHANGED` | This user created the ticket |
| 10 | `QUOTE_CREATED` | This user created the quote |
| 11 | `QUOTE_STATUS_CHANGED` | This user created the quote |

Assigned employee only (`employee_id`):

| # | Event | When |
|---|---|---|
| 12 | `QUOTE_CREATED` | Assigned on the quote |
| 13 | `QUOTE_STATUS_CHANGED` | Assigned on the quote |
| 14 | `ORDER_CREATED` | Assigned on the order |
| 15 | `ORDER_STATUS_CHANGED` | Assigned on the order |
| 16 | `ORDER_CANCELLED` | Assigned on the order |
| 17 | `ORDER_SERVICE_STATUS_CHANGED` | Assigned on the order |
| 18 | `ORDER_SERVICE_CANCELLED` | Assigned on the order |
| 19 | `ORDER_PAYMENT_RECEIVED` | Assigned on the order |
| 20 | `ORDER_ADDITIONAL_CHARGE_ADDED` | Assigned on the order |
| 21 | `ORDER_ADDITIONAL_CHARGE_UPDATED` | Assigned on the order |
| 22 | `ORDER_ADDITIONAL_CHARGE_REMOVED` | Assigned on the order |
| 23 | `ORDER_REFUND_PROCESSED` | Assigned on the order |
| 24 | `DISPUTE_RAISED` | Assigned on the dispute |

---

## Partner

This partner’s quotes, orders, subscription, posts, and wallet.

| # | Event | When |
|---|---|---|
| 1 | `QUOTE_ASSIGNED` | Quote assigned to this partner |
| 2 | `QUOTE_CREATED` | Quote released to this partner (pending or later) |
| 3 | `QUOTE_STATUS_CHANGED` | Quote status changed after it was released to this partner |
| 4 | `QUOTE_ACTION_REMINDER` | Pending quote waiting too long |
| 5 | `QUOTE_DEADLINE_REMINDER` | Pending quote expiring soon |
| 6 | `ORDER_CREATED` | Order created with this partner |
| 7 | `ORDER_STATUS_CHANGED` | Order status changed |
| 8 | `ORDER_CANCELLED` | Order cancelled |
| 9 | `ORDER_SERVICE_ASSIGNED` | Service assigned to this partner |
| 10 | `ORDER_SERVICE_UNASSIGNED` | Service removed from this partner |
| 11 | `ORDER_SERVICE_TIME_UPDATED` | Service time updated |
| 12 | `ORDER_SERVICE_STATUS_CHANGED` | Service status changed |
| 13 | `ORDER_SERVICE_CANCELLED` | Service cancelled |
| 14 | `ORDER_PAYMENT_RECEIVED` | Customer payment received on this order |
| 15 | `ORDER_ADDITIONAL_CHARGE_ADDED` | Extra charge added |
| 16 | `ORDER_ADDITIONAL_CHARGE_UPDATED` | Extra charge updated |
| 17 | `ORDER_ADDITIONAL_CHARGE_REMOVED` | Extra charge removed |
| 18 | `ORDER_REFUND_PROCESSED` | Refund processed |
| 19 | `ORDER_REVIEW_RECEIVED` | Customer left a review |
| 20 | `ORDER_INVOICE_DOWNLOADED` | Invoice downloaded |
| 21 | `APPOINTMENT_SCHEDULED` | Appointment scheduled |
| 22 | `APPOINTMENT_STATUS_CHANGED` | Appointment status changed |
| 23 | `SERVICE_REMINDER` | Upcoming service |
| 24 | `SUBSCRIPTION_ASSIGNED` | Plan assigned |
| 25 | `SUBSCRIPTION_STATUS_CHANGED` | Subscription status changed |
| 26 | `SUBSCRIPTION_PLAN_CHANGED` | Partner changed plan |
| 27 | `SUBSCRIPTION_PAYMENT_COMPLETED` | Subscription payment successful |
| 28 | `SUBSCRIPTION_EXPIRING_REMINDER` | Plan expiring soon |
| 29 | `SUBSCRIPTION_ENDED_REMINDER` | Plan ended |
| 30 | `WALLET_CREDIT` | Amount credited to wallet |
| 31 | `WALLET_DEBIT` | Amount debited from wallet |
| 32 | `PARTNER_VERIFICATION_APPROVED` | Account verified |
| 33 | `PARTNER_VERIFICATION_REJECTED` | Verification not approved |
| 34 | `PARTNER_POST_APPROVED` | Portfolio post approved |
| 35 | `PARTNER_POST_REJECTED` | Portfolio post rejected |
| 36 | `PARTNER_POST_HIDDEN` | Portfolio post hidden |
| 37 | `PARTNER_POST_REMOVED` | Portfolio post removed |
| 38 | `PARTNER_POST_LIKED` | Customer liked a post |
| 39 | `TICKET_STATUS_CHANGED` | This partner created the ticket |

---

## User (customer)

This customer’s quotes, orders, appointments, and disputes.

| # | Event | When |
|---|---|---|
| 1 | `QUOTE_CREATED` | Quote created |
| 2 | `QUOTE_STATUS_CHANGED` | Quote status changed (not accepted) |
| 3 | `QUOTE_ACCEPTED` | Partner accepted the quote |
| 4 | `QUOTE_ACTION_REMINDER` | Accepted quote waiting too long |
| 5 | `QUOTE_DEADLINE_REMINDER` | Accepted quote expiring soon |
| 6 | `ORDER_CREATED` | Order created |
| 7 | `ORDER_STATUS_CHANGED` | Order status changed |
| 8 | `ORDER_CANCELLED` | Order cancelled |
| 9 | `ORDER_SERVICE_STATUS_CHANGED` | Service status changed |
| 10 | `ORDER_SERVICE_CANCELLED` | Service cancelled |
| 11 | `ORDER_PAYMENT_COMPLETED` | Customer payment successful |
| 12 | `ORDER_PAYMENT_FAILED` | Payment failed |
| 13 | `ORDER_ADDITIONAL_CHARGE_ADDED` | Extra charge added |
| 14 | `ORDER_ADDITIONAL_CHARGE_UPDATED` | Extra charge updated |
| 15 | `ORDER_ADDITIONAL_CHARGE_REMOVED` | Extra charge removed |
| 16 | `ORDER_REFUND_PROCESSED` | Refund processed |
| 17 | `ORDER_INVOICE_DOWNLOADED` | Invoice downloaded |
| 18 | `PARTNER_WORK_STARTED` | Partner started work |
| 19 | `PARTNER_WORK_COMPLETED` | Partner completed work |
| 20 | `APPOINTMENT_SCHEDULED` | Appointment scheduled |
| 21 | `APPOINTMENT_STATUS_CHANGED` | Appointment status changed |
| 22 | `SERVICE_REMINDER` | Upcoming service |
| 23 | `DISPUTE_STATUS_CHANGED` | Dispute status changed |
| 24 | `TICKET_STATUS_CHANGED` | This customer created the ticket |
