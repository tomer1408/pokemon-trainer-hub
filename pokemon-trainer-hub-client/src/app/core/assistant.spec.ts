import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AssistantResult, AssistantService, AssistantRecommendation, ChatReply } from './assistant';

describe('AssistantService', () => {
  let service: AssistantService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AssistantService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('analyzeTeam() wraps a successful response as { ok: true, value }', () => {
    const rec: AssistantRecommendation = { type: 'electric', reasoning: 'Balanced.', pokemon: null };
    let result: AssistantResult<AssistantRecommendation> | undefined;
    service.analyzeTeam().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/assistant/analyze`).flush(rec);

    expect(result).toEqual({ ok: true, value: rec });
  });

  it('analyzeTeam() carries the server\'s specific error message through on failure', () => {
    let result: AssistantResult<AssistantRecommendation> | undefined;
    service.analyzeTeam().subscribe((r) => (result = r));

    httpMock
      .expectOne(`${API_BASE}/assistant/analyze`)
      .flush({ message: "We've hit today's AI usage limit — please try again tomorrow." }, { status: 503, statusText: 'Service Unavailable' });

    expect(result).toEqual({ ok: false, message: "We've hit today's AI usage limit — please try again tomorrow." });
  });

  it('analyzeTeam() falls back to a generic message when the server sends no message', () => {
    let result: AssistantResult<AssistantRecommendation> | undefined;
    service.analyzeTeam().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/assistant/analyze`).flush('', { status: 502, statusText: 'Bad Gateway' });

    expect(result).toEqual({ ok: false, message: 'The AI assistant is unavailable right now. Please try again later.' });
  });

  it('query() posts the description text and wraps the result', () => {
    const rec: AssistantRecommendation = { type: 'fire', reasoning: 'Sounds fiery.', pokemon: null };
    let result: AssistantResult<AssistantRecommendation> | undefined;
    service.query('a strong fire type').subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/assistant/query`);
    expect(req.request.body).toEqual({ text: 'a strong fire type' });
    req.flush(rec);

    expect(result).toEqual({ ok: true, value: rec });
  });

  it('chat() posts the full message history and wraps the reply', () => {
    const reply: ChatReply = { text: 'Hi there!', pokemon: null };
    const messages = [{ role: 'user' as const, text: 'hi' }];
    let result: AssistantResult<ChatReply> | undefined;
    service.chat(messages).subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/assistant/chat`);
    expect(req.request.body).toEqual({ messages });
    req.flush(reply);

    expect(result).toEqual({ ok: true, value: reply });
  });

  it('generateTeamNames() posts only the style, never team/Pokémon data', () => {
    let result: any;
    service.generateTeamNames('Epic').subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/assistant/team-name`);
    expect(req.request.body).toEqual({ style: 'Epic' });
    req.flush({ names: ['Thunder Squad'] });

    expect(result).toEqual({ ok: true, value: { names: ['Thunder Squad'] } });
  });
});
