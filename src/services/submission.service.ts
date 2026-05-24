import { getProblemById } from "../apis/problem.api";
import logger from "../config/logger.config";
import { ISubmission, SubmissionStatus } from "../models/submission.model";
import { addSubmissionJob } from "../producers/submission.producer";
import { ISubmissionRepository } from "../repositories/submission.repository";
import { NotFoundError } from "../utils/errors/app.error";

export interface ISubmissionService {
    createSubmission(submissionData: Partial<ISubmission>): Promise<ISubmission>;
    getSubmissionById(id: string): Promise<ISubmission | null>;
    getSubmissionsByProblemId(problemId: string): Promise<ISubmission[]>;
    deleteSubmissionById(id: string): Promise<void>;
    updateSubmissionStatus(id: string, status: SubmissionStatus): Promise<ISubmission | null>;
}

export class SubmissionService implements ISubmissionService {
    private submissionRepository: ISubmissionRepository;

    constructor(submissionRepository: ISubmissionRepository) {
        this.submissionRepository = submissionRepository;
    }

    async createSubmission(submissionData: Partial<ISubmission>): Promise<ISubmission> {
        // check if the problem exists, then add submission payload to db, then add the submission to the queue for processing
        if(!submissionData.problemId) {
            throw new Error('Problem ID is required');
        }
        if(!submissionData.code) {
            throw new Error('Code is required');
        }
        if(!submissionData.language) {
            throw new Error('Language is required');
        }
        const problem = await getProblemById(submissionData.problemId as string);
        if (!problem) {
            throw new NotFoundError('Problem not found');
        }
        const newSubmission = await this.submissionRepository.create(submissionData);
        const jobId = await addSubmissionJob({
            submissionId: newSubmission._id.toString(),
            problem,
            code: newSubmission.code,
            language: newSubmission.language
        })
        logger.info(`Created submission with ID ${newSubmission._id} and added to queue with job ID ${jobId}`);
        return newSubmission;
    }

    async getSubmissionById(id: string): Promise<ISubmission | null> {
        return this.submissionRepository.findById(id);
    }

    async getSubmissionsByProblemId(problemId: string): Promise<ISubmission[]> {
        return this.submissionRepository.findByProblemId(problemId);
    }

    async deleteSubmissionById(id: string): Promise<void> {
        return this.submissionRepository.deleteById(id);
    }

    async updateSubmissionStatus(id: string, status: SubmissionStatus): Promise<ISubmission | null> {
        return this.submissionRepository.updateStatus(id, status);
    }
}