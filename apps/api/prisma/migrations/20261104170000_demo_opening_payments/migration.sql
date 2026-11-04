-- O seed anterior guardava paidAmount, mas ainda não tinha histórico de pagamentos a fornecedores.
-- Registra exclusivamente saldos iniciais da empresa de demonstração; não inventa datas de pagamento reais.
INSERT INTO "PayablePayment" ("id","payableId","amount","date","method")
SELECT 'seed-opening-' || p.id, p.id, p."paidAmount", p."dueDate", 'DEMO_OPENING'
FROM "Payable" p
WHERE p."paidAmount">0
AND EXISTS (SELECT 1 FROM "Company" WHERE id='demo-company')
AND NOT EXISTS (SELECT 1 FROM "PayablePayment" pp WHERE pp."payableId"=p.id);
