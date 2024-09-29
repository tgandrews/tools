import inquirer from "inquirer";

(async () => {
  const result = await inquirer.prompt([
    {
      message: "What is the term of the loan in years?",
      name: "term",
      type: "number",
    },
    {
      message: "What is the loan amount?",
      name: "amount",
      type: "input",
    },
    {
      message: "What is the total interest fee?",
      name: "interestAmount",
      type: "input",
    },
  ]);

  const { term, amount: amountString, interestAmount: interestString } = result;

  const amount = parseFloat(amountString);
  const interestCost = parseFloat(interestString);
  const total = amount + interestCost;

  const interestRate = (total / amount) ** (1 / term) - 1;

  console.log({
    interestCost,
    amount,
    term,
    interestRate,
  });

  console.log(`The interest rate is: ${interestRate * 100}%`);
})().catch(console.error);
