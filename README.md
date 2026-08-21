# MAWID Pro

**Live demo:** [saeed-alorm.github.io/mawid-pro](https://saeed-alorm.github.io/mawid-pro/)

MAWID is a fictional, browser-local product prototype. It uses no backend, real authentication,
SMS, payments, or customer data. Use demo OTP `123456` and **Reset demo data** to restore the
seeded presentation state.

Build a polished, mobile-first, bilingual SaaS prototype for salon and barbershop appointment booking and business management.

PRODUCT IDENTITY

Create a fictional SaaS brand named MAWID | موعد.

Brand personality:
- Modern, reliable, premium, and easy to use
- Designed for salons, hairdressers, and barbers in Lebanon
- Deep emerald primary color, warm cream background, charcoal text, and restrained gold accents
- Clean typography using an English font such as Inter and an Arabic-compatible font such as Tajawal
- Avoid excessive gradients, glass effects, oversized headings, or a generic AI-generated appearance

Suggested tagline:
- English: “Smarter schedules. Stronger salons.”
- Arabic: “مواعيد أذكى. إدارة أفضل.”

PRODUCT STRUCTURE

This is a multi-tenant SaaS product. Every salon has its own private workspace, employees, schedules, bookings, customers, branding, and business data.

It is not a public salon marketplace.

For demonstration purposes only, create a demo launcher that allows the viewer to switch among three fictional salon workspaces:
1. Studio Nine — premium unisex salon
2. Cedar & Steel — men’s barbershop
3. Maison Luma — women’s hair and beauty salon

Give each salon its own logo treatment, cover image, color accents, employees, services, and appointments. Clearly label the tenant selector as a prototype demonstration feature, not a customer-facing marketplace.

All businesses, employees, customers, phone numbers, and booking data must be fictional.

PROTOTYPE LEVEL

Build a working front-end prototype using local demo data.

Requirements:
- No backend or Supabase
- No real SMS or authentication integration
- Store prototype changes in local state or localStorage
- Include a visible “Reset demo data” option
- All important buttons and flows must work
- Use simulated OTP verification
- Display the demo OTP code clearly during testing
- Use the six-digit demo code 123456

LANGUAGE AND LOCALIZATION

The complete interface must support:
- English with left-to-right layout
- Arabic with full right-to-left layout

Add a clear EN / AR language toggle.

When Arabic is selected:
- Change the entire layout direction to RTL
- Reverse navigation, icons, alignment, booking steps, calendar controls, and form layouts where appropriate
- Use proper Arabic labels—not English text placed inside an RTL container
- Keep names and demo content natural and readable

Include translations for all navigation items, buttons, forms, statuses, errors, charts, notifications, and booking steps.

Examples:
- Dashboard — لوحة التحكم
- Bookings — الحجوزات
- Team — الفريق
- Schedule — الجدول
- Analytics — التحليلات
- Pending approval — قيد الموافقة
- Approve — موافقة
- Reject — رفض
- Reschedule — تعديل الموعد

DEMO ENTRY SCREEN

Create a polished prototype launcher with:
- MAWID logo and tagline
- Salon workspace selector
- Language selector
- “View customer experience” button
- “Open management dashboard” button
- Short explanation that each salon operates through its own private workspace

This launcher exists only to demonstrate the different tenants and user experiences.

CUSTOMER BOOKING EXPERIENCE

Create a mobile-first salon page that feels like the salon’s own branded booking website.

The page should include:
- Salon cover image and logo
- Salon name and short introduction
- Location and opening hours
- Primary “Book an appointment” action
- Service categories
- Employee preview cards
- Upcoming booking access for authenticated demo customers

BOOKING JOURNEY

Create a clear, step-by-step booking flow:
1. Select a service
2. Select a preferred employee
3. View that employee’s available dates and time slots
4. Select a date and time
5. Review the appointment
6. Enter a Lebanese phone number
7. Verify the number using the simulated OTP
8. Submit the appointment request
9. Display confirmation that the request is awaiting salon approval

The appointment must not be confirmed immediately.

Use the status:
- English: “Pending salon approval”
- Arabic: “بانتظار موافقة الصالون”

Explain that the customer will be notified after the salon approves, rejects, or proposes a different time.

EMPLOYEE SELECTION

Employee cards must include:
- Professional photo
- Name
- Role or specialization
- Short profile
- Working days
- Available time-slot indicator
- “Select” and “View profile” actions

Allow customers to choose a specific employee. Do not automatically assign an employee unless the customer explicitly selects an “Any available professional” option.

CUSTOMER BOOKING MANAGEMENT

After OTP verification, provide a simple “My appointments” view showing:
- Pending requests
- Approved appointments
- Rejected or rescheduled requests
- Past appointments
- Appointment details
- A functional cancellation action for eligible appointments

SALON MANAGEMENT DASHBOARD

Create a responsive management workspace for salon owners and managers.

On desktop, use a refined sidebar navigation. On mobile, convert it into a compact drawer or bottom navigation.

Navigation should include:
- Overview
- Bookings
- Calendar
- Team
- Customers
- Analytics
- Settings

DASHBOARD OVERVIEW

Show realistic local demo data through:
- Today’s bookings
- Pending approval requests
- Weekly bookings
- Cancellation rate
- Returning customer activity
- Employee utilization
- Peak booking hours
- Recent booking activity

Use a mix of:
- KPI cards
- A weekly booking trend chart
- A peak-hours visualization
- An employee-performance comparison
- A recent activity list

Keep charts readable on mobile and fully translated in Arabic.

BOOKING APPROVAL WORKFLOW

Create a functional booking-request queue.

Each pending request should show:
- Customer name and phone
- Requested service
- Selected employee
- Requested date and time
- Request submission time
- Current status

Provide functional actions:
- Approve
- Reject
- Propose another time
- Open booking details

When a manager approves a request:
- Change its status to approved
- Add it to the selected employee’s calendar
- Update dashboard totals
- Show a success notification

When proposing another time:
- Let the manager select an alternative available slot
- Change the request status to “Reschedule proposed”
- Show the proposed time in the customer’s appointment view

BOOKING CALENDAR

Create daily and weekly calendar views.

Requirements:
- Display appointments grouped by employee
- Use clear status colors for pending, approved, completed, cancelled, and reschedule proposed
- Filter by employee and status
- Open appointment details from the calendar
- Prevent obvious overlapping appointments in the local prototype
- Ensure the calendar remains usable on smaller screens

EMPLOYEE SCHEDULE AND PERFORMANCE

Create a team directory and individual employee detail pages.

Each employee page should contain:

Profile:
- Photo
- Name
- Role
- Specializations
- Short biography
- Active or inactive status

Schedule:
- Weekly working hours
- Break periods
- Days off
- Available and unavailable time blocks
- Ability to edit the weekly schedule locally
- Ability to add a temporary unavailable period

Performance:
- Total bookings
- Completed appointments
- Cancelled appointments
- Schedule utilization
- Repeat customer activity
- Booking trend over time

Do not use employee ratings or revenue figures unless supported by the existing demo data.

SAMPLE SERVICES

Give each salon a relevant fictional service catalogue. Include service name, category, duration, and short description. Do not display service prices in this prototype.

Examples may include:
- Haircut
- Blow-dry
- Hair styling
- Hair coloring
- Beard trim
- Beard styling
- Hair treatment

Only show services relevant to each fictional salon.

INTERACTION AND VISUAL QUALITY

The prototype should feel ready for a client presentation.

Include:
- Smooth but restrained transitions
- Loading, empty, success, and error states
- Confirmation dialogs for destructive actions
- Toast notifications for important actions
- Accessible color contrast
- Large mobile tap targets
- Consistent spacing and card styles
- Realistic editorial salon imagery and professional staff portraits
- No lorem ipsum
- No broken or inactive primary actions

DEMO CONTINUITY

Use shared local data across the customer and management experiences.

A booking created through the customer flow must:
1. Appear in the management dashboard as pending
2. Be available for approval, rejection, or rescheduling
3. Update the customer’s booking status after the manager acts
4. Appear in the employee calendar after approval
5. Affect the relevant dashboard and employee metrics

This connected workflow is the most important part of the prototype.

BOUNDARIES FOR THIS VERSION

Do not build:
- A public salon marketplace
- Online payments or deposits
- Real OTP or SMS integration
- Backend authentication
- Database integration
- TV appointment display
- Inventory management
- Payroll
- Point-of-sale functionality

Focus on presenting a convincing, connected experience across:
1. Customer appointment booking
2. Salon booking management
3. Employee schedules and performance
4. Bilingual English and Arabic usability

Start by building the complete responsive prototype with realistic fictional data for all three salon workspaces.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1a8d104a-c71e-4117-b9df-46390c0fa58e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## GitHub Pages

The Pages workflow runs the unit tests, builds the static SPA at the `/mawid-pro/` repository
base path, verifies the entry and route fallback files, and deploys the artifact.

```sh
npm run build:pages
npm run verify:pages
npm run preview:pages
```
