import * as actions from "@actions/core";
import main from "./main";

try {
  actions.info("");
  await main();
} catch (error: any) {
  actions.setFailed(error.message);
}
