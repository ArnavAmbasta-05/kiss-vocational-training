-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "data" JSONB;
