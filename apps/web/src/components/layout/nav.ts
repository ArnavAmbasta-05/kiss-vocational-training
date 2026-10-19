export interface NavItem {
  to: string;
  /** i18n key in the common namespace. */
  labelKey: string;
  end?: boolean;
}

/** Sidebar items. Sprint 2 replaces this with one list per role. */
export const defaultNav: NavItem[] = [{ to: '/', labelKey: 'nav.home', end: true }];
