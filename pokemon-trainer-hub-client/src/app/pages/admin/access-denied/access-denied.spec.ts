import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminAccessDenied } from './access-denied';

describe('AdminAccessDenied', () => {
  it('renders the access-denied message and a real link back to Home', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AdminAccessDenied);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("You don't have access to this page");

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a.primary-btn');
    expect(link.getAttribute('href')).toBe('/home');
  });
});
