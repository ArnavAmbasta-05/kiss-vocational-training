import { SETTINGS, SETTING_KEYS, defaultSettings, isSettingKey, parseSetting } from '../registry';

describe('settings registry', () => {
  it('defines every threshold named in CLAUDE.md rule 4 with the BRD defaults', () => {
    expect(defaultSettings()).toMatchObject({
      'attendance.minPercent': 75,
      'aggregate.minPercent': 40,
      'attendance.editWindowHours': 48,
      'grade.bands': { A: 85, B: 70, C: 55, D: 40 },
      'allocation.priorityRule': 'SUBMISSION_TIME',
      'risk.medium.attendanceBelow': 80,
      'risk.medium.consecutiveAbsences': 3,
      'risk.medium.assessmentBelow': 50,
      'risk.high.attendanceBelow': 75,
      'risk.high.projectedBelow': 40,
      'risk.high.dropPoints': 15,
      'risk.closeAfterClearDays': 7,
      'risk.escalateAfterDays': 14,
      'enrollment.maxPreferences': 3,
      'auth.maxFailedLogins': 5,
      'auth.lockMinutes': 15,
      'public.rateLimitPerMin': 30,
    });
  });

  it('every default passes its own schema and has a description', () => {
    for (const key of SETTING_KEYS) {
      expect(() => parseSetting(key, SETTINGS[key].default)).not.toThrow();
      expect(SETTINGS[key].description.length).toBeGreaterThan(10);
    }
  });

  it('rejects wrong types and out-of-range values', () => {
    expect(() => parseSetting('attendance.minPercent', '75')).toThrow();
    expect(() => parseSetting('attendance.minPercent', 100.01)).toThrow();
    expect(() => parseSetting('allocation.priorityRule', 'RANDOM')).toThrow();
    expect(() => parseSetting('enrollment.maxPreferences', 4)).toThrow();
    expect(() => parseSetting('grade.bands', { A: 85, B: 85, C: 55, D: 40 })).toThrow();
  });

  it('recognises only registered keys', () => {
    expect(isSettingKey('attendance.minPercent')).toBe(true);
    expect(isSettingKey('attendance.maxPercent')).toBe(false);
    expect(isSettingKey('toString')).toBe(false);
  });
});
