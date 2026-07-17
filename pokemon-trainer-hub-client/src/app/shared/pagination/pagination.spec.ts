import { TestBed } from '@angular/core/testing';
import { Pagination } from './pagination';

describe('Pagination', () => {
  function setup(page: number, totalPages: number) {
    const fixture = TestBed.createComponent(Pagination);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('totalPages', totalPages);
    fixture.detectChanges();
    return fixture;
  }

  it('emits page - 1 on prev(), unless already on the first page', () => {
    const fixture = setup(3, 10);
    let emitted: number | undefined;
    fixture.componentInstance.pageChange.subscribe((p) => (emitted = p));

    fixture.componentInstance.prev();
    expect(emitted).toBe(2);
  });

  it('does not emit on prev() when already on page 1', () => {
    const fixture = setup(1, 10);
    const spy = vi.fn();
    fixture.componentInstance.pageChange.subscribe(spy);

    fixture.componentInstance.prev();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits page + 1 on next(), unless already on the last page', () => {
    const fixture = setup(3, 10);
    let emitted: number | undefined;
    fixture.componentInstance.pageChange.subscribe((p) => (emitted = p));

    fixture.componentInstance.next();
    expect(emitted).toBe(4);
  });

  it('does not emit on next() when already on the last page', () => {
    const fixture = setup(10, 10);
    const spy = vi.fn();
    fixture.componentInstance.pageChange.subscribe(spy);

    fixture.componentInstance.next();
    expect(spy).not.toHaveBeenCalled();
  });

  it('goTo() emits the target page, but not the current page again', () => {
    const fixture = setup(3, 10);
    const spy = vi.fn();
    fixture.componentInstance.pageChange.subscribe(spy);

    fixture.componentInstance.goTo(7);
    expect(spy).toHaveBeenCalledWith(7);

    spy.mockClear();
    fixture.componentInstance.goTo(3);
    expect(spy).not.toHaveBeenCalled();
  });

  it('goTo() ignores an "ellipsis" click', () => {
    const fixture = setup(5, 10);
    const spy = vi.fn();
    fixture.componentInstance.pageChange.subscribe(spy);

    fixture.componentInstance.goTo('ellipsis');
    expect(spy).not.toHaveBeenCalled();
  });

  it('windows the page numbers around the current page, always including first/last', () => {
    const fixture = setup(5, 10);
    const numbers = (fixture.componentInstance as any).pageNumbers();
    expect(numbers).toEqual([1, 'ellipsis', 3, 4, 5, 6, 7, 'ellipsis', 10]);
  });

  it('renders every page number when the total is small enough that no window is needed', () => {
    const fixture = setup(1, 3);
    const numbers = (fixture.componentInstance as any).pageNumbers();
    expect(numbers).toEqual([1, 2, 3]);
  });
});
