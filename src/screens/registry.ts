/* The screen of each workflow step. A screen is a React component for the step's canvas, plus the step's main action
   when it is not "Continue" (primary), and whether the shell shows the step head and the action bar. The step's data,
   checks and actions stay in its js/stages file. */
import type { FunctionComponent } from 'react';
import type { Ctx, PrimaryAction } from '../am';
import { Home } from './Home';
import { RoomScreen } from './Room';
import { TargetScreen } from './Target';
import { SetupScreen } from './Setup';
import { MeasureScreen, measurePrimary } from './Measure';
import { ProcessingScreen, processingPrimary } from './Processing';
import { ResultsScreen, resultsPrimary } from './Results';
import { AssessmentScreen, assessmentPrimary } from './Assessment';
import { TreatmentScreen, treatmentPrimary } from './Treatment';
import { PredictionScreen } from './Prediction';
import { FinalScreen, finalPrimary } from './Final';

export interface ScreenDef {
  Body: FunctionComponent<{ ctx: Ctx }>;
  primary?: (ctx: Ctx) => PrimaryAction | null | undefined;
  header?: boolean;
  footer?: boolean;
}

export const SCREENS: Record<string, ScreenDef> = {
  home: { Body: Home, header: false, footer: false },
  room: { Body: RoomScreen },
  target: { Body: TargetScreen },
  setup: { Body: SetupScreen },
  measure: { Body: MeasureScreen, primary: measurePrimary },
  processing: { Body: ProcessingScreen, primary: processingPrimary },
  results: { Body: ResultsScreen, primary: resultsPrimary },
  assessment: { Body: AssessmentScreen, primary: assessmentPrimary },
  treatment: { Body: TreatmentScreen, primary: treatmentPrimary },
  prediction: { Body: PredictionScreen },
  final: { Body: FinalScreen, primary: finalPrimary },
};

export const screenFor = (id: string): ScreenDef => SCREENS[id];
