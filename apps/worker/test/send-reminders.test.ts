import assert from 'node:assert/strict';
import test from 'node:test';
import { reminderEmail, sendReminders, type DueReminder } from '../src/jobs/send-reminders.js';

const reminder: DueReminder = {
  id: 'reminder-1',
  email: 'alex@example.com',
  contestName: 'Round 1',
  contestUrl: 'https://example.com/contest/1',
  startsAt: '2026-10-07T12:00:00.000Z',
  offsetMinutes: 30,
};

test('renders a contest reminder email', () => {
  const email = reminderEmail(reminder);
  assert.equal(email.subject, 'Round 1 starts soon');
  assert.match(email.text, /https:\/\/example.com\/contest\/1/);
  assert.match(email.html, /Open contest/);
});

test('sends due reminders and releases failed deliveries', async () => {
  const sent: string[] = [];
  const released: string[] = [];
  const result = await sendReminders(
    {
      async claimDue() {
        return [reminder, { ...reminder, id: 'reminder-2' }];
      },
      async markSent(id) {
        sent.push(id);
      },
      async release(id) {
        released.push(id);
      },
    },
    {
      async send({ to }) {
        if (to === reminder.email && sent.length > 0) throw new Error('mail unavailable');
      },
    },
  );
  assert.deepEqual(result, { sent: 1, failed: 1 });
  assert.deepEqual(sent, ['reminder-1']);
  assert.deepEqual(released, ['reminder-2']);
});
