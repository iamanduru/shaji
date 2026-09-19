import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

export const errorHandler: ErrorRequestHandler = (
    _error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    res.status(500).json({
        error:{
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred"
        }
    });
};