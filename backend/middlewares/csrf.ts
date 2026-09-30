import { Request, Response, NextFunction } from 'express';
const csrfProtect = (req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const xRequestedWith = req.headers['x-requested-with'];
        if (xRequestedWith !== 'TradeDash') {
            return res.status(403).json({ error: 'CSRF validation failed' });
        }
    }
    next();
};
export default csrfProtect;
