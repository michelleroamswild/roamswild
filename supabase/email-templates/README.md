# Email Templates Setup

Custom email templates for Supabase authentication emails, styled to match the RoamsWild branding.

## Templates Included

- **confirm-signup.html** - Email verification for new accounts
- **reset-password.html** - Password reset emails
- **magic-link.html** - Passwordless sign-in emails
- **invite-user.html** - Invitation emails for new users

## Setup with Resend

### 1. Create Resend Account

1. Go to [resend.com](https://resend.com) and create an account
2. Verify your domain (roamswild.com)
3. Generate an API key

### 2. Configure Supabase SMTP

In your Supabase Dashboard:

1. Go to **Project Settings** → **Authentication** → **SMTP Settings**
2. Enable "Custom SMTP"
3. Enter these settings:

| Setting | Value |
|---------|-------|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Your Resend API key |
| Sender email | `noreply@roamswild.com` |
| Sender name | `RoamsWild` |

### 3. Configure Email Templates

In your Supabase Dashboard:

1. Go to **Authentication** → **Email Templates**
2. For each template type, copy the HTML content from the corresponding file:

| Template Type | File |
|--------------|------|
| Confirm signup | `confirm-signup.html` |
| Reset password | `reset-password.html` |
| Magic link | `magic-link.html` |
| Invite user | `invite-user.html` |

### 4. Update Subject Lines

Recommended subject lines:

| Template | Subject |
|----------|---------|
| Confirm signup | `Confirm your email - RoamsWild` |
| Reset password | `Reset your password - RoamsWild` |
| Magic link | `Sign in to RoamsWild` |
| Invite user | `You're invited to join RoamsWild` |

## Template Variables

Supabase provides these variables for use in templates:

- `{{ .ConfirmationURL }}` - The confirmation/action link
- `{{ .Token }}` - The raw token
- `{{ .TokenHash }}` - Hashed token
- `{{ .SiteURL }}` - Your site URL
- `{{ .Email }}` - User's email address

## Branding Reference

Colors used:
- Primary (header bg): `#3f3e2c`
- Secondary (page bg): `#e9e5d4`
- Accent (buttons): `#a5c94a`
- Text dark: `#3f3e2c`
- Text muted: `#7a7968`
- Link color: `#a5c94a`

Font: DM Sans (with system fallbacks)

## Testing

After setup, test each email type:

1. **Confirm signup**: Create a new account
2. **Reset password**: Use "Forgot password" flow
3. **Magic link**: Enable magic links and request sign-in
4. **Invite user**: Use Supabase Dashboard → Authentication → Users → Invite

Check that emails are delivered and render correctly across:
- Gmail (web & mobile)
- Apple Mail
- Outlook
