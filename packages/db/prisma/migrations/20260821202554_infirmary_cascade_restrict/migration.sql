-- DropForeignKey
ALTER TABLE "InfirmaryFormResponse" DROP CONSTRAINT "InfirmaryFormResponse_formId_fkey";

-- AddForeignKey
ALTER TABLE "InfirmaryFormResponse" ADD CONSTRAINT "InfirmaryFormResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "InfirmaryForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
