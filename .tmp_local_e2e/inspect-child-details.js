const base = 'http://127.0.0.1:3000/api';
const ids = [
  '7c7bb618-fb90-4d7f-86c6-42d673f239bf',
  'bbda032c-671a-4a4f-8584-d60ce6989c31',
  '28a2d00b-6752-4fad-acf9-3574dd3bb864',
];

async function json(response) {
  const body = await response.json();
  if (!response.ok || body.code !== 0) throw new Error(response.status + ' ' + JSON.stringify(body));
  return body.data;
}

async function main() {
  const auth = await json(await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'zhaotianqi', password: 'LocalBiz#2026' }),
  }));
  const output = [];
  for (const id of ids) {
    const detail = await json(await fetch(base + '/dispatched-orders/' + id, {
      headers: { authorization: 'Bearer ' + auth.accessToken },
    }));
    const extraData = detail.extraData || detail.extra_data || {};
    const fields = Array.isArray(detail.fields) ? detail.fields : [];
    output.push({
      id,
      moduleCode: detail.moduleCode || detail.module_code,
      mobile: extraData.mobile,
      email: extraData.email,
      fieldCodes: fields.map((field) => field.fieldCode),
      mobileFieldValue: fields.find((field) => field.fieldCode === 'mobile')?.value,
      emailFieldValue: fields.find((field) => field.fieldCode === 'email')?.value,
    });
  }
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
