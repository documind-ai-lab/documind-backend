import { Module } from "@nestjs/common";
import { PrismaModule } from "./shared/infrastructure/prisma/prisma.module";

@Module({ imports: [PrismaModule] })
export class AppModule {}
