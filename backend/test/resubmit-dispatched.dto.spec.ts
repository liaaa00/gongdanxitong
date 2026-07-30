import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResubmitDispatchedOrderDto } from 'src/modules/dispatched-orders/dto/resubmit.dto';

describe('ResubmitDispatchedOrderDto', () => {
  it('keeps the reason optional and trims a provided reason', async () => {
    const empty = plainToInstance(ResubmitDispatchedOrderDto, { reason: '   ' });
    const filled = plainToInstance(ResubmitDispatchedOrderDto, { reason: '  以员工辞职报告真实日期为准  ' });

    expect(await validate(empty)).toHaveLength(0);
    expect(empty.reason).toBeUndefined();
    expect(await validate(filled)).toHaveLength(0);
    expect(filled.reason).toBe('以员工辞职报告真实日期为准');
  });

  it('rejects a non-string or overlong reason', async () => {
    const wrongType = plainToInstance(ResubmitDispatchedOrderDto, { reason: { text: '说明' } });
    const overlong = plainToInstance(ResubmitDispatchedOrderDto, { reason: 'a'.repeat(501) });

    expect(await validate(wrongType)).not.toHaveLength(0);
    expect(await validate(overlong)).not.toHaveLength(0);
  });
});
