import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AvatarIconOption, AvatarIconsService } from './avatar-icons';

describe('AvatarIconsService', () => {
  let service: AvatarIconsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AvatarIconsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAvatarIcons() returns the curated set on success', () => {
    const icons: AvatarIconOption[] = [{ pokemonId: 25, name: 'pikachu', category: 'popular', spriteUrl: 's' }];
    let result: AvatarIconOption[] | undefined;
    service.getAvatarIcons().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/avatar-icons`).flush(icons);

    expect(result).toEqual(icons);
  });

  it('getAvatarIcons() falls back to an empty array on error', () => {
    let result: AvatarIconOption[] | undefined;
    service.getAvatarIcons().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/avatar-icons`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toEqual([]);
  });
});
