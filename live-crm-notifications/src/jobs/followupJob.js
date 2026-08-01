const cron = require('node-cron');
const { Companies, Contacts, Assignments } = require('../models');
const { createNotification } = require('../utils/notify');

const FOLLOWUP_DELAY_MS = Number(process.env.FOLLOWUP_DELAY_MS || 60000);

function getEntityName(entityType, entityId) {
  if (entityType === 'COMPANY') {
    const c = Companies.findById(entityId);
    return c ? c.name : 'a company';
  }
  const c = Contacts.findById(entityId);
  return c ? c.name : 'a contact';
}

/**
 * The required "background process" flow for this assignment:
 * a scheduled job scans assignments that are older than FOLLOWUP_DELAY_MS
 * and haven't had a reminder yet, and creates a follow-up notification for
 * the assigned user ("Reminder: follow up on your assignment to X").
 *
 * This is exported separately from the cron schedule so it can also be
 * triggered on-demand via POST /api/jobs/run-followup for demo purposes
 * (waiting a full minute during a live demo is annoying).
 */
function runFollowupCheck(io) {
  const cutoff = new Date(Date.now() - FOLLOWUP_DELAY_MS).toISOString();
  const dueAssignments = Assignments.listDueForReminder(cutoff);

  const created = [];

  for (const assignment of dueAssignments) {
    const entityName = getEntityName(assignment.entityType, assignment.entityId);

    const notification = createNotification(io, {
      userId: assignment.userId,
      type: 'REMINDER',
      message: `Reminder: follow up on your ${assignment.role} assignment to ${entityName}.`,
      metadata: {
        assignmentId: assignment.id,
        entityType: assignment.entityType,
        entityId: assignment.entityId,
      },
    });

    Assignments.markReminderSent(assignment.id);
    created.push(notification);
  }

  if (created.length) {
    console.log(`[followup-job] created ${created.length} reminder notification(s)`);
  }

  return created;
}

/**
 * Schedules the job to run every 30 seconds. In a real deployment this
 * would more likely be a proper queue/worker (BullMQ, SQS, etc.) — node-cron
 * in-process is a deliberate simplification appropriate for this assignment's
 * scope (see README "Assumptions").
 */
function scheduleFollowupJob(io) {
  cron.schedule('*/30 * * * * *', () => {
    try {
      runFollowupCheck(io);
    } catch (err) {
      console.error('[followup-job] error', err);
    }
  });
  console.log('[followup-job] scheduled every 30s (delay threshold: %dms)', FOLLOWUP_DELAY_MS);
}

module.exports = { scheduleFollowupJob, runFollowupCheck };
