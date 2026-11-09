# Security Specification — វំយោលកាហ្វេ (Vomyol Coffee)

## 1. Data Invariants
1. **Menu & Category Integrity**: Only verified Administrators (`isAdmin()`) can create, update, or delete documents in `/categories/{categoryId}` and `/menuItems/{itemId}`. Public storefront visitors can read categories and menu items.
2. **Order Creation & Payment Verification**: Customers can create orders in `/orders/{orderId}` only with strict schema validation (`isValidOrder`), bounded string lengths, non-negative amounts, and valid KHQR metadata. Updating payment status to `PAID` or modifying order fulfillment status (`PREPARING`, `COMPLETED`, `CANCELLED`) is restricted to verified payment confirmation or Admin action.
3. **Invoice Integrity**: Invoices in `/invoices/{invoiceId}` must adhere to `isValidInvoice` with positive or zero monetary totals and bounded string sizes.
4. **Backup & Admin Isolation**: `/backups/{backupId}` and `/admins/{adminUid}` are strictly isolated to verified Administrators (`isAdmin()`). No non-admin or unauthenticated user can read or write backups or admin credentials.
5. **Path ID Hardening**: All document IDs must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` characters.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Menu Mutation**: Attempting `create` on `/menuItems/item_1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Shadow Field Injection on Order**: Sending `{ ...validOrder, isAdminOverride: true }` to `/orders/ord_1` -> `PERMISSION_DENIED` (`hasOnly` check fails).
3. **Negative Price Injection on Order**: Sending `totalUsd: -15.00` on `/orders/ord_2` -> `PERMISSION_DENIED`.
4. **Oversized String Denial-of-Wallet**: Sending a 10,000-character `note` in `/orders/ord_3` -> `PERMISSION_DENIED` (`note.size() <= 400`).
5. **ID Poisoning Attack**: Creating `/orders/bad$id!@#` -> `PERMISSION_DENIED` (`isValidId` regex guard).
6. **Spoofed Unverified Admin Email**: Request with `auth.token.email == 'krenoudom7@gmail.com'` but `email_verified == false` attempting to delete `/menuItems/item_1` -> `PERMISSION_DENIED`.
7. **Unauthorized Backup Read**: Non-admin user reading `/backups/bkp_1` -> `PERMISSION_DENIED`.
8. **Self-Assigned Admin Role**: Non-admin user writing to `/admins/some_uid` -> `PERMISSION_DENIED`.
9. **Immutable Timestamp Tampering**: Updating `createdAt` on `/orders/ord_1` to a different value -> `PERMISSION_DENIED`.
10. **Invalid Enum Status on Order**: Setting `paymentStatus: "HACKED"` on `/orders/ord_1` -> `PERMISSION_DENIED`.
11. **Value Poisoning on MenuItem Price**: Updating `priceUsd` to a string `"free"` -> `PERMISSION_DENIED`.
12. **Blanket Admin Credential Scraping**: Unauthenticated or non-admin `list` on `/admins` -> `PERMISSION_DENIED`.
