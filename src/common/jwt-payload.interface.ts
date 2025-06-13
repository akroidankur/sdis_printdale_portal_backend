export interface JwtPayload {
    _id: string;
    employeeId: string;
    iat: number;
    exp: number;
}