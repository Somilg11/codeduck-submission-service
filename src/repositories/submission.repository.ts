import { ISubmission, Submission } from "../models/submission.model";

export interface ISubmissionRepository {
    create(submissionData: Partial<ISubmission>): Promise<ISubmission>;
    findById(id: string): Promise<ISubmission | null>;
    findByProblemId(problemId: string): Promise<ISubmission[]>;
    deleteById(id: string): Promise<void>;
    updateStatus(id: string, status: ISubmission['status']): Promise<ISubmission | null>;
}

export class SubmissionRepository implements ISubmissionRepository {
    private submissions: ISubmission[] = [];

    async create(submissionData: Partial<ISubmission>): Promise<ISubmission> {
        const newSubmission = await Submission.create(submissionData);
        this.submissions.push(newSubmission);
        return newSubmission;
    }

    async findById(id: string): Promise<ISubmission | null> {
        const submission = await Submission.findById(id);
        return submission;
    }

    async findByProblemId(problemId: string): Promise<ISubmission[]> {
        const submissions = await Submission.find({ problemId });
        return submissions;
    }

    async deleteById(id: string): Promise<void> {
        const result = await Submission.findByIdAndDelete(id);
        return result ? undefined : Promise.reject(new Error('Submission not found'));
    }

    async updateStatus(id: string, status: ISubmission['status']): Promise<ISubmission | null> {
        const updatedSubmission = await Submission.findByIdAndUpdate(id, { status }, { new: true });
        return updatedSubmission;
    }
}