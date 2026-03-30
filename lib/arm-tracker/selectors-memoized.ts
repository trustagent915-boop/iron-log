// NUOVO FILE: Memoizzazione aggressiva di tutti i selector costosi
// Installa prima: npm i fast-equals
import memoizeDeep from 'fast-equals';
import {
  buildExerciseLeaderboard,
  buildExerciseTrend,
  buildMonthlyHistoryData,
  buildStatusDistributionData,
  buildWeekdayPatternData,
  buildYearlyVolumeData,
  filterDataByYear,
  getAverageAdherence,
  getExerciseOptions,
  getGamificationSummary,
  getHistoryDateRange,
} from './selectors';

// Memoizza tutti i selector costosi per evitare recalcoli
export const memoizedSelectors = {
  buildMonthlyHistoryData: memoizeDeep(buildMonthlyHistoryData),
  buildYearlyVolumeData: memoizeDeep(buildYearlyVolumeData),
  buildWeekdayPatternData: memoizeDeep(buildWeekdayPatternData),
  buildExerciseLeaderboard: memoizeDeep(buildExerciseLeaderboard),
  buildExerciseTrend: memoizeDeep(buildExerciseTrend),
  buildStatusDistributionData: memoizeDeep(buildStatusDistributionData),
  filterDataByYear: memoizeDeep(filterDataByYear),
  getAverageAdherence: memoizeDeep(getAverageAdherence),
  getExerciseOptions: memoizeDeep(getExerciseOptions),
  getGamificationSummary: memoizeDeep(getGamificationSummary),
  getHistoryDateRange: memoizeDeep(getHistoryDateRange),
};
