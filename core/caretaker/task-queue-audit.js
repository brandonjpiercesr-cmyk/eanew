// ⬡B:core.caretaker.task-queue-audit:MODULE:built:20260702⬡
// entered via the ABAHAM door, serving channel MESSAGES

const { TaskQueue } = require('../task-queue');
const { Bead } = require('../bead');
const { StampType } = require('../stamp-type');

module.exports = function(caretaker) {
  const taskQueue = new TaskQueue();
  const bead = new Bead();

  caretaker.on('cycle', async () => {
    await checkForDuplicateTasks();
    await sweepStaleTasks();
  });

  async function checkForDuplicateTasks() {
    const queuedTasks = await taskQueue.getQueuedTasks();
    const dispatchedTasks = await taskQueue.getDispatchedTasks();

    for (const task of queuedTasks) {
      const duplicateTask = queuedTasks.find(t => t.targetFile === task.targetFile && t.id !== task.id);
      if (duplicateTask) {
        await taskQueue.holdTask(task.id);
      }
    }

    for (const task of dispatchedTasks) {
      const duplicateTask = dispatchedTasks.find(t => t.targetFile === task.targetFile && t.id !== task.id);
      if (duplicateTask) {
        await taskQueue.holdTask(task.id);
      }
    }
  }

  async function sweepStaleTasks() {
    const pendingTasks = await taskQueue.getPendingTasks();
    const now = new Date();

    for (const task of pendingTasks) {
      const targetFileBead = await bead.getFileBead(task.targetFile);
      if (targetFileBead && (targetFileBead.stampType === StampType.TASK_DONE || targetFileBead.result)) {
        const taskCreationDate = new Date(task.createdAt);
        if (targetFileBead.updatedAt > taskCreationDate) {
          await taskQueue.retireTask(task.id);
        }
      }
    }
  }
};