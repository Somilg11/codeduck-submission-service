import axios, { AxiosResponse } from "axios";
import { serverConfig } from "../config";
import logger from "../config/logger.config";
import { InternalServerError } from "../utils/errors/app.error";

export interface ITestCase {
    input: string;
    output: string;
}

export interface IProblemDetails {
    id: string;
    title: string;
    description: string;
    difficulty: 'easy' | 'medium' | 'hard';
    editorial?: string;
    testcases: ITestCase[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IProblemResponse {
    data: IProblemDetails;
    message: string;
    success: boolean;
}

export async function getProblemById(problemId: string): Promise<IProblemDetails | null> {
    try {
        const response: AxiosResponse<IProblemResponse> = await axios.get(`${serverConfig.PROBLEM_SERVICE_URL}/problems/${problemId}`);
        if(response.data.success) {
            return response.data.data;
        } else {
            throw new InternalServerError(`Failed to fetch problem details: ${response.data.message}`);
        }
    } catch (error) {
        logger.error(`Error fetching problem with ID ${problemId}:`, error);
        throw new InternalServerError('Failed to fetch problem details');
    }
}