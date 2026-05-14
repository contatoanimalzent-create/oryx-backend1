import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClassesController } from './classes.controller';
import { ExercisesController } from './exercises.controller';
import { InstructorsController } from './instructors.controller';
import { TacticalReportsController } from './reports/reports.controller';
import { TacticalReportsService } from './reports/reports.service';
import { TacticalService } from './tactical.service';
import { UnitsController } from './units.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    UnitsController,
    InstructorsController,
    ClassesController,
    ExercisesController,
    TacticalReportsController,
  ],
  providers: [TacticalService, TacticalReportsService],
  exports: [TacticalService, TacticalReportsService],
})
export class TacticalModule {}
