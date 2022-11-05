import axios from 'axios';
import { Anotacao } from './model/Anotacao';
import { EMAIL, MODALS, notificar } from './State';

function email(next) {
    if (EMAIL.value) {
        next(EMAIL.value)
    } else {
        MODALS.push({
            titulo: 'Email para utilizar API',
            html: '<p>Algumas APIs solicitam seu email, esse dado será transmitido a ela e não será salvo no GeneAPP. É necessário informar um email valido para utilizar essa funcionalidade.</p>',
            inputs: [{ label: 'email', value: 'your@mail' }],
            botoes: [
                {
                    text: 'OK', color: 'bg-sky-500', default: true,
                    action: ({ email }) => email && /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email),
                    end: (_, dt) => {
                        next(EMAIL.value = dt['email'])
                    }
                },
                {
                    text: 'Cancelar', color: 'bg-amber-500',
                    action: () => true,
                    end: () => notificar('Só é possivel continuar apos informar email.', 'warn', 20)
                }
            ]
        })
    }
}

export function withEmail(x) { email(x) }

// !curl --request POST 'https://rest.uniprot.org/idmapping/run' \
//    --form 'ids="NP_001330439.1"' \
//    --form 'from="RefSeq_Protein"' \
//    --form 'to="UniProtKB"'
//    {"jobId":"4124e9e788e93903027c33da0f3076ce81471c1c"}
//    !curl 'https://rest.uniprot.org/idmapping/status/4124e9e788e93903027c33da0f3076ce81471c1c'
//    {"jobStatus":"FINISHED"}
//    ! curl -s "https://rest.uniprot.org/idmapping/uniprotkb/results/4124e9e788e93903027c33da0f3076ce81471c1c"
//    {"results":[{"from":"NP_001330439.1","to":{"entryType":"UniProtKB unrevi

export function getUniprot(id: string, cbk: (x) => {}) {
    return axios.postForm('https://rest.uniprot.org/idmapping/run', {
        ids: id,
        from: "RefSeq_Protein",
        to: "UniProtKB"
    })
        .then(res => {
            const job = res.data.jobId
            const intv = setInterval(() => {
                axios.get('https://rest.uniprot.org/idmapping/status/' + job)
                    .then(res => {
                        if (res.data.results || res.data.jobStatus === "FINISHED") {
                            clearInterval(intv);
                            if (res.data.results)
                                cbk(res.data.results)
                            else
                                axios.get("https://rest.uniprot.org/idmapping/uniprotkb/results/" + job)
                                    .then(res => cbk(res.data))
                        }
                    })
            }, 3000)
        })
}

export function getNCBIaa(id, seq = (aa: string) => aa) {
    return axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi', {
        params: {
            db: 'protein',
            id,
            rettype: 'fasta',
            retmode: 'text'
        }
    }).then(res => seq(res.data.split('\n').slice(1).join('')))
}

export function getInterpro(sequence: string,
    status = (x: string, t) => null,
    fim = (x: Anotacao[]) => null) {
    const ipro = `https://www.ebi.ac.uk/Tools/services/rest/iprscan5`
    email(email => {
        axios.postForm(
            `${ipro}/run`, {
            email,
            goterms: false,
            pathways: false,
            appl: 'PfamA',
            title: 'anotar',
            sequence
        }).then(res => {
            const job = res.data;
            status(`Job ${job.substring(0, 5)}...${job.slice(-5)} anotando pela API InterproScan5`, 1)
            const itv = setInterval(() => {
                axios.get(`${ipro}/status/${job}`).then(res => {
                    if (res.data === 'FINISHED') {
                        clearInterval(itv)
                        axios.get(`${ipro}/result/${job}/tsv`).then(res => {
                            if (!res || res.data.split('\t') < 2) {
                                console.log(res.data)
                                return status(`Job ${job.substring(0, 5)}...${job.slice(-5)} sem anotacao`, 2)
                            }
                            var anotacoes = []
                            res.data
                                .split('\n')
                                .map(x => x.split('\t'))
                                .filter(x => x.length > 4)
                                .forEach(
                                    x => (anotacoes = anotacoes.concat(Anotacao.fromRaw2(x)))
                                )
                            fim(anotacoes)
                        })
                    }
                })
            }, 60000)
        })
    })
}

