import { IProblemDetails } from "../apis/problem.api";
import logger from "../config/logger.config";
import { submissionQueue } from "../queues/submission.queue";

export interface ISubmissionJob {
    submissionId: string;
    problem: IProblemDetails;
    code: string;
    language: string;
}

export async function addSubmissionJob(data: ISubmissionJob): Promise<string | null> {
    try {
        const job = await submissionQueue.add("evaluateSubmission", data);
        logger.info(`Added submission job with ID ${job.id} for submission ${data.submissionId}`);
        return job.id || null;
    } catch (error) {
        logger.error('Error adding submission job:', error);
        return null;
    }
}