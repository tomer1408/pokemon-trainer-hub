import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { SupportService } from './support';

describe('SupportService', () => {
  let service: SupportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SupportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('submit() resolves true on success, posting the full payload', () => {
    const payload = { name: 'Ash', email: 'ash@example.com', topic: 'Bug', message: 'It broke.' };
    let ok: boolean | undefined;
    service.submit(payload).subscribe((r) => (ok = r));

    const req = httpMock.expectOne(`${API_BASE}/support`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 1 });

    expect(ok).toBe(true);
  });

  it('submit() resolves false on error instead of throwing', () => {
    let ok: boolean | undefined;
    service.submit({ name: '', email: 'ash@example.com', topic: 'Bug', message: 'It broke.' }).subscribe((r) => (ok = r));

    httpMock.expectOne(`${API_BASE}/support`).flush('error', { status: 400, statusText: 'Bad Request' });

    expect(ok).toBe(false);
  });
});
