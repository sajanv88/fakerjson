import { Table, TableBody, TableCaption, TableCell, TableContainer, TableHead, TableHeader, TableRow } from '@nuvui/table';
import { CheckIcon, MinusIcon } from '@nuvui/icons';
import './Comparison.scss';

type Mark = { ok: boolean; text: string };
const yes = (text = 'Yes'): Mark => ({ ok: true, text });
const no = (text = 'No'): Mark => ({ ok: false, text });

const rows: { feature: string; ours: Mark; theirs: Mark }[] = [
  { feature: 'Resources', ours: yes('18'), theirs: yes('6') },
  { feature: 'Pagination, filters, sorting, search', ours: yes(), theirs: yes() },
  { feature: 'Pagination metadata in the body (meta, links)', ours: yes(), theirs: no() },
  { feature: 'Sparse fieldsets (?fields=)', ours: yes(), theirs: no() },
  { feature: 'Writes validated, with 422 field errors', ours: yes(), theirs: no('Accepts any body') },
  { feature: 'Several stable datasets (?seed=)', ours: yes(), theirs: no('One dataset') },
  { feature: 'Localised data', ours: yes('16 locales'), theirs: no('Latin placeholder text') },
  { feature: 'Simulated latency and error codes', ours: yes(), theirs: no() },
  { feature: 'RFC 9457 error documents', ours: yes(), theirs: no() },
  { feature: 'OpenAPI 3 spec and Swagger UI', ours: yes(), theirs: no() },
];

function Cell({ mark }: { mark: Mark }) {
  return (
    <span className={mark.ok ? 'comparison__mark comparison__mark--yes' : 'comparison__mark comparison__mark--no'}>
      {mark.ok ? <CheckIcon size={16} aria-hidden="true" /> : <MinusIcon size={16} aria-hidden="true" />}
      {mark.text}
    </span>
  );
}

export function Comparison() {
  return (
    <section className="site-section" id="compare" aria-labelledby="compare-title">
      <div className="site-section__inner">
        <div className="site-section__intro">
          <p className="site-section__eyebrow">// compared</p>
          <h2 className="site-section__title" id="compare-title">
            Familiar like JSONPlaceholder. Built like a real API.
          </h2>
          <p className="site-section__lead">
            JSONPlaceholder made fake REST APIs a habit. FakerJson keeps its six resources and adds what modern
            front-ends need to test against.
          </p>
        </div>
        <TableContainer>
          <Table>
            <TableCaption visuallyHidden>FakerJson compared with JSONPlaceholder</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>FakerJson</TableHead>
                <TableHead>JSONPlaceholder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.feature}>
                  <TableCell rowHeader>{row.feature}</TableCell>
                  <TableCell>
                    <Cell mark={row.ours} />
                  </TableCell>
                  <TableCell>
                    <Cell mark={row.theirs} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </section>
  );
}
