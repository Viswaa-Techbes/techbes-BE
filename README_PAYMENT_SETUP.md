Razorpay Integration & Manual Verification

1) Environment
- Set these env variables for backend (BE):
  - `RAZORPAY_KEY_ID` - your Razorpay key id
  - `RAZORPAY_KEY_SECRET` - your Razorpay key secret
  - `JWT_SECRET` - existing JWT secret
  - `MONGODB_URI` - MongoDB connection string

2) Create-order flow (customer checkout)
- Frontend will call `POST /api/v2/payments/create-order` with body `{ bookingPayload }` where `bookingPayload` contains full booking details including `cctvDetails.priceBreakdown.grandTotal`.
- Backend creates a Razorpay order (amount in paise) and a `Payment` record with `meta.bookingPayload` and returns order data.

3) Payment verification
- After successful checkout, frontend posts the Razorpay response to `POST /api/v2/payments/verify-payment` with `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.
- Backend verifies the signature and, if valid, creates the `Job` (booking) from the stored `bookingPayload` and marks the `Payment` as `verified`.

4) Testing locally
- Seed a test user and login to get a JWT saved in the frontend localStorage key `techbes_backend_token` (the frontend uses this key).
- Use the UI to add a CCTV configuration to cart and proceed to checkout. The checkout will create an order and open Razorpay checkout.
- For testing in Razorpay sandbox, use sandbox credentials and test cards (Razorpay provides test numbers). After payment, the booking should be created and you should be redirected to `booking-success?bookingId=...`.

5) Webhook
- Optionally configure Razorpay webhooks to call your backend `/api/v2/payments/webhook` (not implemented here). The verify endpoint handles the immediate client-side verification and booking creation.

6) Notes
- Bookings created by admins or legacy flows via `/api/v2/bookings/create` still create bookings immediately; marketplace bookings are created only after payment verification via the payment flow.

If you want, I can add a webhook handler and admin UI to view payment records.